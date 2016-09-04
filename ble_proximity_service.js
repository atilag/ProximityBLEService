'use strict'
var util = require('util');
var bleno = require('bleno');
var ursa = require('ursa');
var crypto = require('crypto');
var fs = require('fs');
var exec = require('child_process').exec;


// We DO need to run with root privileges :(
if(process.getuid() != 0){
  console.log("We need to run with root privileges... sorry :(");
  process.exit(1);
}

// Create RSA Keys dynamically
var keyPair = ursa.generatePrivateKey(1024, 65537);
var pubPem = keyPair.toPublicPem();
var privPem = keyPair.toPrivatePem();
var aesSecret = '';

var password = '';
var ssid = '';

// Like 2cms from the peer!!!
const PROXIMITY_RSSI_THRESHOLD = -40;

function decryptWithRsa(msg) {
  return new Promise(function(resolve, reject){
    try{
      var decryptedMsg = keyPair.decrypt(msg.toString('binary'), 'base64', 'binary', ursa.RSA_PKCS1_PADDING);
      return resolve(decryptedMsg);
    }catch(ex){
      return reject("Error with RSA decrypting!! ex: " + ex);
    }
  });
}

function decryptWithAes(msg){
  return new Promise(function(resolve, reject){
    try{
      // TODO: Move to AES-256
      var aesDecipher = crypto.createDecipher('aes-128-ecb', aesSecret);
      var buffTmp = Buffer.from(msg, 'base64');
      var decryptedMsg = aesDecipher.update(buffTmp.toString('binary'), 'base64', 'binary');
      decryptedMsg += aesDecipher.final('binary');
      resolve(decryptedMsg);
    }catch(ex){
      reject("Error with AES decrypting!! ex: " + ex);
    }
  });
}

// TODO: Ok, this works for the first time, but the second one will insert a new network{} block
// int wpa_supplicant.conf file... that's not good, anyway, good enough for the PoC :)
function setupWifi(){
  return new Promise(function(resolve, reject){
    exec("sudo killall wpa_supplicant", function(error, stdout, stderr){
      if(error != null && 
         error.message.indexOf('no process found') != 0 && 
         error.message.indexOf('not permitted') == -1){  // that's ok, maybe wpa_supplicant is not running..
        console.log("wpa_supplicant is not running,  let's launch it");
      }else if(error != null){
        console.error("stderr: " + stderr);
        reject('Could not kill wpa_supplicant!!');
      }

      exec("sudo wpa_passphrase " + ssid + " " + password + " | sudo tee -a  /etc/wpa_supplicant/wpa_supplicant.conf", function (error, stdout, stderr) {
        if (error != null) {
          console.error('stderr: ' + stderr);
          reject('Could not exec wpa_passphrase!: error: ' + error);
        }
        exec("sudo /sbin/wpa_supplicant -s -B -P /run/wpa_supplicant.wlan0.pid -i wlan0 -D nl80211,wext -c /etc/wpa_supplicant/wpa_supplicant.conf", function(error, stdout, stderr){
          if(error != null){
            console.error('stderr: ' + stderr);
            reject('Could not run wpa_supplicant!: error: ' + error);
          }
          exec("sudo ifconfig wlan0 down && sudo ifconfig wlan0 up", function(error, stdout, stderr){
            if(error != null){
              console.error('stderr: ' + stderr);
              reject("Could not restart Wlan interface, please reboot to apply the changes");
            }
            resolve();
            // DONE!! :)
          })
        });
      });
    });
  });
}

var BlenoPrimaryService = bleno.PrimaryService;
var BlenoCharacteristic = bleno.Characteristic;
var BlenoDescriptor = bleno.Descriptor;


/**
 * MyPublicKeyCharacteristic
 */
var MyPublicKeyCharacteristic = function() {
  MyPublicKeyCharacteristic.super_.call(this, {
    uuid: 'fffffffffffffffffffffffffffffff1',
    properties: ['read']
  });
};

util.inherits(MyPublicKeyCharacteristic, BlenoCharacteristic);

MyPublicKeyCharacteristic.prototype.onReadRequest = function(offset, callback) {
  var result = this.RESULT_SUCCESS;
  var data = new Buffer(pubPem, 'base64');

  if (offset > data.length) {
    result = this.RESULT_INVALID_OFFSET;
    data = null;
  } else {
    data = data.slice(offset);
  }

  callback(result, data);
};

MyPublicKeyCharacteristic.prototype.onReadRequest.bind(this);

/**
 * AesSecretCharacteristic
 */
 var AesSecretCharacteristic = function() {
  AesSecretCharacteristic.super_.call(this, {
    uuid: 'fffffffffffffffffffffffffffffff2',
    properties: ['write']
  });
};

util.inherits(AesSecretCharacteristic, BlenoCharacteristic);

AesSecretCharacteristic.prototype.onWriteRequest = function(data, offset, withoutResponse, callback) {
  decryptWithRsa(data).then( decryptedSecret => {
    aesSecret = decryptedSecret;
    callback(this.RESULT_SUCCESS);
  }).catch( err => {
    console.error(err);
    callback(this.RESULT_UNLIKELY_ERROR);
  });
}

AesSecretCharacteristic.prototype.onWriteRequest.bind(this);


/**
 * PasswordCharacteristic
 */
var PasswordCharacteristic = function() {
  PasswordCharacteristic.super_.call(this, {
    uuid: 'fffffffffffffffffffffffffffffff3',
    properties: ['write']
  });
};

util.inherits(PasswordCharacteristic, BlenoCharacteristic);

PasswordCharacteristic.prototype.onWriteRequest = function(data, offset, withoutResponse, callback) {
  decryptWithAes(data).then( decryptedData => {
     password = decryptedData;
    console.log("Password received!!");
    callback(this.RESULT_SUCCESS);
  }).catch( err => {
    console.error(err);
    callback(this.RESULT_UNLIKELY_ERROR);
  })
};

PasswordCharacteristic.prototype.onWriteRequest.bind(this);

/**
 * SsidCharacteristic
 */
var SsidCharacteristic = function() {
  SsidCharacteristic.super_.call(this, {
    uuid: 'fffffffffffffffffffffffffffffff4',
    properties: ['write']
  });
};

util.inherits(SsidCharacteristic, BlenoCharacteristic);

SsidCharacteristic.prototype.onWriteRequest = function(data, offset, withoutResponse, callback) {
  decryptWithAes(data).then(decryptedData => {
    ssid = decryptedData;
    console.log("Received SSID: ", ssid);
    return setupWifi();
  }).then(() => {
    console.log("All done!!\nCheck Wifi connectivity!!");
    callback(this.RESULT_SUCCESS);
  }).catch( err => {
    console.error(err);
    callback(this.RESULT_UNLIKELY_ERROR);
  });
};

SsidCharacteristic.prototype.onWriteRequest.bind(this);


function SampleService() {
  SampleService.super_.call(this, {
    uuid: 'fffffffffffffffffffffffffffffff0',
    characteristics: [
      new MyPublicKeyCharacteristic(),
      new AesSecretCharacteristic(),
      new PasswordCharacteristic(),
      new SsidCharacteristic(),
    ]
  });
}

util.inherits(SampleService, BlenoPrimaryService);

bleno.on('stateChange', function(state) {
  console.log('on -> stateChange: ' + state + ', address = ' + bleno.address);
  if (state === 'poweredOn') {
     bleno.setServices([
      new SampleService()
    ]);
  } else {
    bleno.stopAdvertising();
  }
});

bleno.on('accept', function(clientAddress) {
  console.log('on -> accept, client: ' + clientAddress);
  bleno.updateRssi();
});

bleno.on('rssiUpdate', function(rssi) {
  console.log('on -> rssiUpdate: ' + rssi);
  // Check rssi proximity and disconnect if it's not close enough
  if(rssi < PROXIMITY_RSSI_THRESHOLD) { 
    console.log('on -> rssiUpdate: peer is not close enough! disconnecting it...');
    bleno.disconnect();
  }
});

bleno.on('disconnect', function(clientAddress) {
  console.log('on -> disconnect, client: ' + clientAddress);
});


bleno.on('mtuChange', function(mtu) {
  console.log('on -> mtuChange: ' + mtu);
});

bleno.on('advertisingStart', function(error) {
  console.log('on -> advertisingStart: ' + (error ? 'error ' + error : 'success'));
});

bleno.on('advertisingStop', function() {
  console.log('on -> advertisingStop');
});

bleno.on('servicesSet', function(error) {
  console.log('on -> servicesSet: ' + (error ? 'error ' + error : 'success'));
  bleno.startAdvertising('test', ['fffffffffffffffffffffffffffffff0']);
});

