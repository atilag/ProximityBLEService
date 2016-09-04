# What's this!?
This is just the server (or Bluetooth LE Gatt service) part of a proof of
concept.
I wanted to test a way to configure a device that is running this service,
by physically touching with a phone that is running the client App.

# Ok, How does it work?
The way to know this is by checking that the Bluetooth RSSI is high enough
to determine that both devices are (almost) touching each other.
Once both sides have determined that they are touching, the client App
requests an RSA Public Key to the server, so he can cypher an AES Secret
that will be send back to the server. This AES Secret is going to be used
to encrypt all the remaining communication, that is basically sending a
Wifi SSDI and it's passphrase. Last, the server is going to configure
the Wifi access via wpa_supplicant using the SSID and the passphrase.

# How secure is it?
Well, pretty secure I guess!! The server creates a pair of RSA keys
dynamically on every execution (yes! we can even create them on every
connection... I leave this option for any contributor).
The Client App is the one in charge to create the AES-128 Secret (once again
I leave the upgrade to AES-256 for contributors!), but this time is created
every time we receive the RSA Public Key from the server.

# Why not using Bluetoot in-built encryption?
That's simple, Bluetooth only encrypts data when there's a pairing process that
involves some kind of input like 6 digit typing. Hence I would be restricting
the PoC to devices with these capabilties, and in the server side is very 
common to have stand-alone devices without any physical input.

# What else do I need to run the PoC?
It works on a RPI3 for the server side, but any system that could run NodeJS and
have a Bleno compatible Bluetooth LE Chipset should work. If you want the Wifi
setup functionality working as well, then your S.O. must have installed
wpa_supplicant.

And finally... you need the client Android App! of course, clone it [here]()!

Enjoy!

- Juan Gómez Mosquera

