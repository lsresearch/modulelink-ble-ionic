angular.module('tiwi-ble', [])

.service('$tiwiBle', ['$ble', '$timeout', '$rootScope', '$converter', '$interval', '$ionicPopup', '$q', function($ble, $timeout, $rootScope, $c, $interval, $ionicPopup, $q){

	/*
		Let's set up some variables that will be used throughout $tiwiBle.
		
		Change SCAN_LIMIT to change the duration of time (in ms) that a scan
		for devices will last before terminating.

	*/
	var validNames = ["SaBLE-x","TiWi-uB1"];
	var devices = {}, scanning = false, currentDevice, rssiInterval, ret;
	var SCAN_LIMIT = 10000;

	/*
	
		The following UUIDs are used on the SaBLE-x and TiWi-uB1 chips.
		Variables with _UUID represent services, while other variables
		represent characteristics of those services.

	*/
	var GPIO_UUID = "3347aaa0-fb94-11e2-a8e4-f23c91aec05e";
	var GPIO_LED = "3347aaa4-fb94-11e2-a8e4-f23c91aec05e";
	var GPIO_BUTTON_CHECK = "3347aaa1-fb94-11e2-a8e4-f23c91aec05e";
	var GPIO_BUTTON = "3347aaa3-fb94-11e2-a8e4-f23c91aec05e";

	var BATTERY_UUID = "180F";
	var BATTERY_VOLTAGE = "2A19";

	var BATTERY_SABLE_UUID = "3347aaf0-fb94-11e2-a8e4-f23c91aec05e";
	var BATTERY_SABLE_VOLTAGE = "3347aaf1-fb94-11e2-a8e4-f23c91aec05e";

	var TEMP_UUID = "3347aac0-fb94-11e2-a8e4-f23c91aec05e";
	var TEMP_DATA = "3347aac1-fb94-11e2-a8e4-f23c91aec05e";
	var TEMP_CONF = "3347aac2-fb94-11e2-a8e4-f23c91aec05e";

	var RANGE_UUID = "3347aab0-fb94-11e2-a8e4-f23c91aec05e";
	var RANGE_RSSI = "3347aab1-fb94-11e2-a8e4-f23c91aec05e";
	var RANGE_PACKETS = "3347aab2-fb94-11e2-a8e4-f23c91aec05e";

	var LIGHT_UUID = "3347aae0-fb94-11e2-a8e4-f23c91aec05e";
	var LIGHT_LUX = "3347aae1-fb94-11e2-a8e4-f23c91aec05e";

	var ACCL_UUID = "3347aad0-fb94-11e2-a8e4-f23c91aec05e";
	var ACCL_TILT = "3347aad1-fb94-11e2-a8e4-f23c91aec05e";
	var ACCL_CONF = "3347aad2-fb94-11e2-a8e4-f23c91aec05e";

	var SERIAL_UUID = "3347ab00-fb94-11e2-a8e4-f23c91aec05e";
	var SERIAL_ACCEPT = "3347ab03-fb94-11e2-a8e4-f23c91aec05e"; // true if device can send to phone
	var SERIAL_DATA = "3347ab01-fb94-11e2-a8e4-f23c91aec05e";
	var SERIAL_SEND_DATA = "3347ab02-fb94-11e2-a8e4-f23c91aec05e";
	var SERIAL_RECEIVE = "3347ab04-fb94-11e2-a8e4-f23c91aec05e"; // true if phone can send to device

	/*
		This error popup will be used throughout $tiwiBle to notify
		the user if there has been a problem communicating with the
		bluetooth device.
	*/
	var errorPopup = function(message){
		$ionicPopup.show({
			template: message,
			title: "Error",
			buttons: [
				{text: "OK"}
			]
		})
	}

	/*
		In iOS, the $ble.services call does not return corresponding
		characteristics, and therefore you cannot subscribe to any
		characteristics without first discovering them.

		This function loops through all services that have already
		been discovered from the module to fetch their corresponding
		characteristics.

		Afterwards we can move on to the subscription loop.
	*/
	var characteristicLoop = function(address){

		$ble.characteristics(function(resp){

			devices[address].services.push({
				'characteristics': resp.characteristics,
				'serviceUuid': resp.serviceUuid
			});

			devices[address].onService++;

			if (devices[address].onService < devices[address].serviceUuids.length){
				characteristicLoop(address);
			}else{
				subscribeLoop(address);
			}

		}, function(resp){
			errorPopup("Failed to retrieve charactersitic.");
		}, {
			"address": address,
			"serviceUuid": devices[address].serviceUuids[devices[address].onService]
		});

	}

	/*
		Queue control for serial devices.
	*/
	function setAccept(v){
		var address = currentDevice;
		var deferred = $q.defer();

		$ble.write(function(resp){
			if (v==1){
				acceptData = true;
			}
			deferred.resolve(resp);
		}, function(resp){
			deferred.reject(resp);
		}, {
			"address": address,
			"serviceUuid": SERIAL_UUID,
			"characteristicUuid": SERIAL_ACCEPT,
			"value": $ble.bytesToEncodedString([v])
		});

		return deferred.promise;
	}
	var acceptData = true;
	function canAccept(){
		return setAccept(1);
	}
	function cannotAccept(){
		acceptData = false;
		return setAccept(0);
	}
	function writeData(s, error){
		var address = currentDevice;
		devices[address].send_queue.push({'data': [s, error], 'call': function(s2, error2){
			$ble.write(function(resp){
				canAccept();
			}, function(resp){
				errorPopup(error2);
			}, {
				"address": address,
				"serviceUuid": SERIAL_UUID,
				"characteristicUuid": SERIAL_SEND_DATA,
				"value": $ble.bytesToEncodedString($ble.stringToBytes(s))
			});
		}});
	}

	/*
		After all services and characteristics have been discovered on
		the module, we move on to the subscribe loop. This function
		subscribes to various characteristics from the module, waiting
		for a response after each subscribe call before moving onto 
		the next one.

		Each "Subscribe" is in a switch->case statement. If you add or
		remove subscriptions, please remember to change the NUM_SUBSCRIBES
		variable at the top of the function.

		After all subscriptions have been completed, the devices "connected"
		status is set to true.
	*/
	var fuckyou = 0;
	var subscribeLoop = function(address){

		if (devices[address].serviceUuids.indexOf(SERIAL_UUID) > -1){

			console.log("SERIAL Device Found");

			// This device is a serial device.

			// Setup the serial device.
			devices[address].model.packetsReceived++;
			devices[address].model.numButtons = 2;
			devices[address].model.hasAccelerometer = true;
			devices[address].model.hasLux = true;
			devices[address].model.serial = true;

			// canAccept().then(function(){
				$ble.subscribe(function(resp){

					if (resp.status=="subscribed"){
						console.log("COUNTER", devices[address].model.packets, devices[address].model.packetsReceived);
						fuckyou=0;
						devices[address].connected = true;
						console.log("FINISHED", devices);

						rssiInterval = $interval(function(){

							$ble.rssi(function(resp){
								devices[address].model.phoneRSSI = resp.rssi;

							}, function(resp){
								$interval.cancel(rssiInterval);
								errorPopup("Failed to retrieve phone RSSI.");
							}, {
								"address": address
							})

						}, 2000);

						$ble.subscribe(function(resp){

							if (resp.status=="subscribed"){
								writeData("2,1,1", "Could not subscribe to temperature.");
								writeData("6,1,1", "Could not subscribe to accelerometer.");
								console.log("Initial LED ", devices[address].model.led);
								ret.changeLED(address, devices[address].model.led);
								canAccept();
								return;
							};

							if (resp.value == "AQ=="){
								if (acceptData == true){
									return;
								}
								var sendData = devices[address].send_queue.shift();
								if (typeof sendData === "undefined") return;
								sendData.call.apply(this, sendData.data);
							}

						}, function(resp){
							errorPopup("Failed to subscribe to recieve data okay.");
						}, {
							"address": address,
							"serviceUuid": SERIAL_UUID,
							"characteristicUuid": SERIAL_RECEIVE
						})

						return;
					}

					cannotAccept().then(function(){
						canAccept();
					});

					var data = atob(resp.value).split(",");

					if (data[1] != "0") return;

					switch(data[0]){
						case "0":
							devices[address].model.voltage = parseFloat(data[2])/parseFloat('1000');
							break;
						case "1":
							devices[address].model.moduleRSSI = parseInt(data[2]);
							devices[address].model.packets = parseInt(data[3]);
							if (devices[address].model.packets < devices[address].model.packetsReceived + 1){
								console.log("PACKET RESET");
								devices[address].model.packetsReceived = 0;
							}
							devices[address].model.packetsReceived++;

							console.log(devices[address].model.packets, devices[address].model.packetsReceived)

							if ((devices[address].model.packets - devices[address].model.packetsReceived) > fuckyou){
								console.log("^^^ DIFFERENT ^^^");
								fuckyou = devices[address].model.packets - devices[address].model.packetsReceived;
								console.log("OFF BY", fuckyou);
							}
							break;
						case "3":
							devices[address].model.temp = parseFloat(data[2]);
							devices[address].model.tempC = devices[address].model.temp / parseFloat('1000');
							devices[address].model.tempF = (devices[address].model.tempC * 1.8)+32;
							break;
						case "4":
							devices[address].model.button = (data[2] == "1" || data[2] == "3");
							devices[address].model.button2 = (data[2] == "2" || data[2] == "3");
							break;
						case "7":
							switch(data[2]){
								case "1":
									// FU or Face-Up State
									devices[address].model.tilt = "Face-Up";
									break;
								case "2":
									//FD or Face-Down State
									devices[address].model.tilt = "Face-Down";
									break;
								case "4":
									//UP or Up State
									devices[address].model.tilt = "Up";
									break;
								case "8":
									//DO or Down State
									devices[address].model.tilt = "Down";
									break;
								case "16":
									// RI or Right State
									devices[address].model.tilt = "Right";
									break;
								case "32":
									//LE or Left State
									devices[address].model.tilt = "Left";
									break;
								default:
									devices[address].model.tilt = data[2];
									break;
							}
							break;
						case "8":
							devices[address].model.lux = parseFloat(data[2])/1000;
							break;
					}

				}, function(resp){
					errorPopup("Failed to get serial data.");
				}, {
					"address": address,
					"serviceUuid": SERIAL_UUID,
					"characteristicUuid": SERIAL_DATA
				})
			// }, function(){
			// 	errorPopup("Failed to set serial accept.");
			// });

		}else{

			console.log("Non-Serial Device");

			// This device is not a serial device.

			var NUM_SUBSCRIBES = 7;

			var nextSubscribe = function(){
				devices[address].onSubscribe++
				if (devices[address].onSubscribe < (NUM_SUBSCRIBES+1)){
					subscribeLoop(address);
				}else{
					devices[address].connected = true;
					ret.changeLED(address, devices[address].model.led);
				}
			}

			switch(devices[address].onSubscribe){
				case 0:

					/*
						Subscribe to the battery voltage descriptor. Response values
						are always received in Base64 encoding, so we first have to
						switch to hex, flip the endian, convert to decimal, and divide
						by 1000 to get the voltage.
					*/

					if (devices[address].serviceUuids.indexOf(BATTERY_SABLE_UUID) > -1){
						var batt_uuid = BATTERY_SABLE_UUID;
						var batt_characteristic = BATTERY_SABLE_VOLTAGE;
					}else{
						var batt_uuid = BATTERY_UUID;
						var batt_characteristic = BATTERY_VOLTAGE;
					}

					$ble.subscribe(function(resp){

						if (resp.status=="subscribed"){
							nextSubscribe();
							return;
						}

						devices[address].model.voltage = resp.value.base64ToHex().flipEndian().hexToDecimal()/1000;

					}, function(resp){
						errorPopup("Failed to read voltage.");
					}, {
						"address": address,
						"serviceUuid": batt_uuid,
						"characteristicUuid": batt_characteristic
					});

					break;

				case 1:

					/*
						In order to subscribe to the temperature readings, we first
						have to write the byte 1 to the TEMP_CONF to tell the module
						that it should actually send subscription updates to us.

						Afterwards we will actually subscribe to temperature updates and
						convert the value we receive into both degrees celsius and
						degrees farenheit.
					*/

					$ble.write(function(resp){

						$ble.subscribe(function(resp){

							if (resp.status=="subscribed"){
								nextSubscribe();
								return;
							}

							devices[address].model.temp = resp.value.base64ToHex().flipEndian().hexToDecimal();
							devices[address].model.tempC = devices[address].model.temp / 256;
							devices[address].model.tempF = (devices[address].model.tempC * 1.8)+32;

						}, function(resp){
							errorPopup("Failed to subscribe to temperature.");
						}, {
							"address": address,
							"serviceUuid": TEMP_UUID,
							"characteristicUuid": TEMP_DATA
						});

					}, function(resp){
						errorPopup("Failed to set temperature flag.");
					}, {
						"address": address,
						"serviceUuid": TEMP_UUID,
						"characteristicUuid": TEMP_CONF,
						"value": $ble.bytesToEncodedString([1])
					});

					break;

				case 2:

					/*
						We then subscribe to the state of the button on the module.
						"AQ==" represents "true" in Base64, so we set the button to
						the statement (resp.value=="AQ==") which will evaluate to 
						true if pressed, and false if unpressed.
					*/

					$ble.read(function(resp){

						if (resp.value == "Ag=="){
							devices[address].model.numButtons = 2;
						}

						$ble.subscribe(function(resp){

							if (resp.status=="subscribed"){
								nextSubscribe();
								return;
							}

							if (devices[address].model.numButtons == 1){
								devices[address].model.button = (resp.value == "AQ==");
							}else{
								devices[address].model.button = (resp.value == "AQ==" || resp.value == "Aw==");
								devices[address].model.button2 = (resp.value == "Ag==" || resp.value == "Aw==");
							}

							/*
								AQ== is button1
								AA== is no buttons
								Ag== is button2
								Aw== is both buttons
							*/

						}, function(resp){
							errorPopup("Failed to subscribe to button status.");
						}, {
							"address": address,
							"serviceUuid": GPIO_UUID,
							"characteristicUuid": GPIO_BUTTON
						});


					}, function(resp){
						errorPopup("Failed to detect number of buttons.");
					}, {
						"address": address,
						"serviceUuid": GPIO_UUID,
						"characteristicUuid": GPIO_BUTTON_CHECK
					})

					break;

				case 3:

					/*
						Then we subscribe to the RSSI value taken from the module.
						This value is sent as a "signed integer" which is technically
						unsupported in JavaScript. To get around this fact, we use
						a fake twos compliment (real one could be programmed if 
						necissary) to get us the correct number.
					*/

					$ble.subscribe(function(resp){

						if (resp.status=="subscribed"){
							nextSubscribe();
							return;
						}

						devices[address].model.moduleRSSI = resp.value.base64ToHex().hexToDecimal().fakeTwosCompliment();

					}, function(resp){
						errorPopup("Failed to subscribe to module RSSI.");
					}, {
						"address": address,
						"serviceUuid": RANGE_UUID,
						"characteristicUuid": RANGE_RSSI
					});

					break;

				case 4:

					/*
						Next we subscribe to the Packet ID that is being
						sent to us by the module. Each packet ID should be
						an incremented number starting at 0. If we ever receive
						a Packet with an ID less than one we have, we reset our
						received counter.
					*/

					$ble.subscribe(function(resp){

						if (resp.status=="subscribed"){
							nextSubscribe();
							return;
						}

						devices[address].model.packets = resp.value.base64ToHex().flipEndian().hexToDecimal();

						if (devices[address].model.packets < devices[address].model.packetsReceived + 1){
							devices[address].model.packetsReceived = 0;
						}

						devices[address].model.packetsReceived++;

					}, function(resp){
						errorPopup("Failed to subscribe to Packet ID.");
					}, {
						"address": address,
						"serviceUuid": RANGE_UUID,
						"characteristicUuid": RANGE_PACKETS
					});

					break;

				case 5:

					/*
						Then we retrieve the phones RSSI value on an interval.
						Since this value cannot be subscribed to, we retrieve
						it every 2000ms.
					*/

					rssiInterval = $interval(function(){

						$ble.rssi(function(resp){
							devices[address].model.phoneRSSI = resp.rssi;
						}, function(resp){
							$interval.cancel(rssiInterval);
							errorPopup("Failed to retrieve phone RSSI.");
						}, {
							"address": address
						})

					}, 2000);

					nextSubscribe();

					break;

				case 6:

					/*
						If a light sensor exists on the device we are connected to
						lets subscribe to it, then convert the hex we get into
						the actual lux value.
					*/

					if (devices[address].serviceUuids.indexOf(LIGHT_UUID) > -1){

						devices[address].model.hasLux = true;

						$ble.subscribe(function(resp){

							if (resp.status=="subscribed"){
								nextSubscribe();
								return;
							}

							/*
								This equation is taken from pages 9 and 10 of the following:
								http://datasheets.maximintegrated.com/en/ds/MAX44009.pdf
								the low register (0x04) and high register (0x03) are sent to us, and then
								we split out each "variable" and plug them into the
								exponent mantissa equation.
							*/

							var bytes = resp.value.base64ToHex();
							var lowReg = bytes.substr(0,2).hexToBin().result.split("");
							var highReg = bytes.substr(2,2).hexToBin().result.split("");

							var m3 = parseInt(lowReg[4]);
							var m2 = parseInt(lowReg[5]);
							var m1 = parseInt(lowReg[6]);
							var m0 = parseInt(lowReg[7]);

							var e3 = parseInt(highReg[0]);
							var e2 = parseInt(highReg[1]);
							var e1 = parseInt(highReg[2]);
							var e0 = parseInt(highReg[3]);
							var m7 = parseInt(highReg[4]);
							var m6 = parseInt(highReg[5]);
							var m5 = parseInt(highReg[6]);
							var m4 = parseInt(highReg[7]);

							var exponent = (8*e3) + (4*e2) + (2*e1) + e0;
							var mantissa = (128*m7) + (64*m6) + (32*m5) + (16*m4) + (8*m3) + (4*m2) + (2*m1) + m0;
							var lux = Math.pow(2,exponent) * mantissa * 0.045;

							devices[address].model.lux = lux;

						}, function(resp){
							errorPopup("Failed to subscribe to light sensor.");
						}, {
							"address": address,
							"serviceUuid": LIGHT_UUID,
							"characteristicUuid": LIGHT_LUX
						});

					}else{
						nextSubscribe();
					}

					break;

				case 7:

					/*
						If the device has an accelerometer, lets subscribe to
						it and get the direction that the device is currently
						facing.
					*/

					if (devices[address].serviceUuids.indexOf(ACCL_UUID) > -1){

						devices[address].model.hasAccelerometer = true;

						$ble.write(function(resp){

							$ble.subscribe(function(resp){

								if (resp.status=="subscribed"){
									nextSubscribe();
									return;
								}

								switch(resp.value.base64ToHex()){
									case "01":
										// FU or Face-Up State
										devices[address].model.tilt = "Face-Up";
										break;
									case "02":
										//FD or Face-Down State
										devices[address].model.tilt = "Face-Down";
										break;
									case "04":
										//UP or Up State
										devices[address].model.tilt = "Up";
										break;
									case "08":
										//DO or Down State
										devices[address].model.tilt = "Down";
										break;
									case "10":
										// RI or Right State
										devices[address].model.tilt = "Right";
										break;
									case "20":
										//LE or Left State
										devices[address].model.tilt = "Left";
										break;
									default:
										devices[address].model.tilt = resp.value.base64ToHex();
										break;
								}


							}, function(resp){
								errorPopup("Failed to subscribe to accelerometer tilt data.");
							}, {
								"address": address,
								"serviceUuid": ACCL_UUID,
								"characteristicUuid": ACCL_TILT
							});

						}, function(resp){
							errorPopup("Failed to set accelerometer flag.");
						}, {
							"address": address,
							"serviceUuid": ACCL_UUID,
							"characteristicUuid": ACCL_CONF,
							"value": $ble.bytesToEncodedString([1])
						});
					}else{
						nextSubscribe();
					}

					break;

			}

		}

	}

	/*
		Whenever we are done scanning, we make sure that we set
		the scanning variable to false, and then broadcast the
		refresh complete event. If the "pull to refresh" spinner
		is visible, this will make sure to hide it.
	*/
	var doneScanning = function(){
		scanning = false;
		$rootScope.$broadcast('scroll.refreshComplete');
	}

	/*
		Here we build an object that we are going to return, thus
		creating publicly accessible functions for $tiwiBle.
	*/
	ret = {
		/*
			startScan makes sure that we're not already scanning and
			that Bluetooth is innitialized. Anytime we find a device
			we add it to our devices object, or update the RSSI value
			if we already discovered it.

			Make sure we only scan for SCAN_LIMIT and not all eternity.
		*/
		'startScan': function(){

			if (scanning) return;

			scanning = true;

			$ble.initialize(function(resp){

			  	if (resp.status == "enabled"){

			  		$ble.startScan(function(resp){
			  			if (typeof devices[resp.address] === "undefined"){
			  				if (validNames.indexOf(resp.name) == -1) return;
			  				devices[resp.address] = resp;
			  				resp.thisScan = true;
			  			}else{
			  				devices[resp.address].rssi = resp.rssi;
			  				devices[resp.address].thisScan = true;
			  			}

			  		}, function(){
			  			doneScanning();
			  		});

			  		$timeout(ret.stopScan, SCAN_LIMIT);

			  	}else{
			  		doneScanning();
			  	}

			  }, function(){
			  	doneScanning();
			  });
		},
		/*
			Stops scanning for devices.
		*/
		'stopScan': function(){
			doneScanning();
			$ble.stopScan();
		},
		/*
			Supply an address to the $tiwiBle.connect function and it will
			attempt to connect to the module.
		*/
		'connect': function(address){

			var connectTimeoutTimer = false;
			var connectTimeout = function(){
				console.log("Gave up connecting to "+address);
				ret.disconnect(address);
			}

			var connectCallback = function(resp){

				console.log("CONNECTED!", resp);

				if (resp.status == "connected"){

					$timeout.cancel(connectTimeoutTimer);

					/*
						Whether or not we are in Android or iOS, initDevice
						is called after the corresponding functions below.
						It's purpose is to set up the devices attribtues.
					*/
					function initDevice(resp){
						if (typeof resp.serviceUuids !== "undefined"){
							devices[address].serviceUuids = resp.serviceUuids;
							devices[address].services = [];
						}else{
							devices[address].services = resp.services;
							devices[address].serviceUuids = [];
							for (var i=0;i<resp.services.length;i++){
								devices[address].serviceUuids.push(resp.services[i].serviceUuid);
							}
						}
						devices[address].disconnected = false;
						if (Object.keys(devices[address]).indexOf("model") > -1){
							console.log("SAVE LED", devices[address].model.led);
							var set_led = devices[address].model.led;
							var set_numButtons = devices[address].model.numButtons;
							var set_hasLux = devices[address].model.hasLux;
							var set_hasAccelerometer = devices[address].model.hasAccelerometer;
						}else{
							var set_led = 0;
							var set_numButtons = 1;
							var set_hasLux = false;
							var set_hasAccelerometer = false;
						}
						devices[address].model = {
							'led': set_led,
							'voltage': 0,
							'temp': 0,
							'tempF': 0,
							'tempC': 0,
							'button': false,
							'button2': false,
							'moduleRSSI': 0,
							'phoneRSSI': devices[address].rssi,
							'packets': 0,
							'packetsReceived': 0,
							'numButtons': set_numButtons,
							'hasLux': set_hasLux,
							'lux': 0,
							'hasAccelerometer': set_hasAccelerometer,
							'tilt': 0,
							'serial': false
						};
						devices[address].send_queue = [];
						devices[address].onService = 0;
						devices[address].onSubscribe = 0;
					}

					currentDevice = address;

					if (ionic.Platform.isIOS()){

						/*
							iOS retrieves the Services that are associated with
							the module before moving on to the Characteristic loop
							from before. That characteristic loop then leeds into
							the subscribe loop before we consider the module
							"connected".
						*/

						$ble.services(function(resp){

							initDevice(resp);
							characteristicLoop(address);

						}, function(resp){
							errorPopup("Failed to retrieve Services.");
						}, {
							"address": address
						});

					}else{

						/*
							Android provides an easier function called "Discover"
							that retrieves all of the Services and Characteristics
							in one go. Once we get the callback from discover we're all
							ready to init the device and go to the Subscribe loop.
						*/

						$ble.discover(function(resp){

							initDevice(resp);
							subscribeLoop(address);

						}, function(resp){
							errorPopup("Failed to discover Services & Characteristics.");
						}, {
							"address": address
						});

					}

				}else if (resp.status == "disconnected"){
					
					devices[address].disconnected = true;
					devices[address].connected = false;
					$interval.cancel(rssiInterval);

					ret.connect(address);

				}

			}

			connectTimeoutTimer = $timeout(connectTimeout, 10000);

			if (devices[address].disconnected){

				/*
					If the device is in the "disconnected" status that
					means that we have already connected to it before.
					If so, we need to use the "reconnect" method instead
					of the regular connect method. This will attempt to
					reuse some of the same resources.
				*/

				$ble.reconnect(connectCallback, function(resp){
					errorPopup("Failed to reconnect to device.");
				}, {
					"address": address
				});

			}else{

				/*
					If we've never connected to this device before, we move
					ahead by calling the connect method.
				*/

				$ble.connect(connectCallback, function(resp){
					errorPopup("Failed to connect to device.");
				}, {
					"address": address
				});

			}
		},
		/*
			The $tiwiBle.changeLED function takes the address of a module/device
			along with the value 0, 1, 2 or 3. These values correspond to
			off, red, green and both respectively.
		*/
		'changeLED': function(address, value){
			if (devices[currentDevice].model.serial){
				writeData("5,1,"+value,"Failed to set LED :(");
				devices[address].model.led = value;
			}else{
				$ble.write(function(resp){
					devices[address].model.led = value;
				}, function(resp){
					errorPopup("Failed to set LED.");
				}, {
					"address": address,
					"serviceUuid": GPIO_UUID,
					"characteristicUuid": GPIO_LED,
					"value": btoa(value)
				})
			}
		},
		/*
			$tiwiBle.disconnect is supplied with a devices address. Then it attempts
			to disconnect from the device, set the disconnected flag and cancel
			the interval that was being used to ping for RSSI.
		*/
		'disconnect': function(address){
			if (devices[address].disconnected) return;
			$ble.disconnect(function(resp){
				devices[address].disconnected = true;
				devices[address].connected = false;
				$interval.cancel(rssiInterval);
			}, function(resp){
				$interval.cancel(rssiInterval);
				errorPopup("Failed to disconnect from device.");
			}, {
				'address': address
			});
		},
		/*
			This returns the devices object that we've been building when devices are
			scanned and/or connected to. You can use this in Angular templates to
			display data such as in device.html and devices.html. (Please note
			that it must be assigned to scope first as seen in controllers.js).
		*/
		'devices': devices,
		/*
			Return the address of the device that $tiwiBle is currently connected to.
		*/
		'currentDeviceID': function(){
			return currentDevice;
		},
		/*
			This marks each devices thisScan flag to false. This is used so we can
			hide devices that have been scanned previously until they are discovered
			again, such as refreshing twice. This allows us to maintain the disconnect
			state so that "reconnect" can be called above.
		*/
		'staleDevices': function(){
			for (var key in devices){
				devices[key].thisScan = false;
			}
		},
		/*
			Simply returns true/false depending on whether or not $tiwiBle is currently
			scanning for devices.
		*/
		'isScanning': function(){
			return scanning;
		}
	}

	return ret;

}])

.service('$ble', ['$timeout', '$rootScope', function($timeout, $rootScope){

	/*

		This is just a wrapper for the com.randdusing.bluetoothle module
		to make callbacks execute in Angulars scope. You can find docs
		at:

		https://github.com/randdusing/BluetoothLE

		or the specific commit that was included in this app:

		https://github.com/randdusing/BluetoothLE/tree/1b6bf490c735ce9c619ccb650bd9ca7929084b7a

	*/

	var bleWrap = function(command, success, error, params){
		if (typeof success === "undefined") success = function(){};
		if (typeof error === "undefined") error = function(){};
		command.apply(this, [function(resp){
			$rootScope.$apply(function(){
				success(resp);
			});
		}, function(resp){
			$rootScope.$apply(function(){
				error(resp);
			});
		}, params]);
	}

	return {
		'initialize': function(success, error, params){
			bleWrap(bluetoothle.initialize, success, error, params);
		},
		'enable': function(success, error){
			bleWrap(bluetoothle.enable, success, error);
		},
		'disable': function(success, error){
			bleWrap(bluetoothle.disable, success, error);
		},
		'startScan': function(success, error, params){
			bleWrap(bluetoothle.startScan, success, error, params);
		},
		'stopScan': function(success, error){
			bleWrap(bluetoothle.stopScan, success, error);
		},
		'retrieveConnected': function(success, error, params){
			bleWrap(bluetoothle.retrieveConnected, success, error, params);
		},
		'connect': function(success, error, params){
			bleWrap(bluetoothle.connect, success, error, params);
		},
		'reconnect': function(success, error, params){
			bleWrap(bluetoothle.reconnect, success, error, params);
		},
		'disconnect': function(success, error, params){
			bleWrap(bluetoothle.disconnect, success, error, params);
		},
		'close': function(success, error, params){
			bleWrap(bluetoothle.close, success, error, params);
		},
		'discover': function(success, error, params){
			bleWrap(bluetoothle.discover, success, error, params);
		},
		'services': function(success, error, params){
			bleWrap(bluetoothle.services, success, error, params);
		},
		'characteristics': function(success, error, params){
			bleWrap(bluetoothle.characteristics, success, error, params);
		},
		'descriptors': function(success, error, params){
			bleWrap(bluetoothle.descriptors, success, error, params);
		},
		'read': function(success, error, params){
			bleWrap(bluetoothle.read, success, error, params);
		},
		'subscribe': function(success, error, params){
			bleWrap(bluetoothle.subscribe, success, error, params);
		},
		'unsubscribe': function(success, error, params){
			bleWrap(bluetoothle.unsubscribe, success, error, params);
		},
		'write': function(success, error, params){
			bleWrap(bluetoothle.write, success, error, params);
		},
		'readDescriptor': function(success, error, params){
			bleWrap(bluetoothle.readDescriptor, success, error, params);
		},
		'rssi': function(success, error, params){
			bleWrap(bluetoothle.rssi, success, error, params);
		},
		/*
			TODO: These have to be implemented a different way, as they take differen
			arguments and cannot be passed to bleWrap as is.
		*/
		// 'isInitialized': function(){
		// 	return bluetoothle.isInitialized();
		// },
		// 'isScanning': function(){
		// 	return bluetoothle.isScanning();
		// },
		// 'isConnected': function(params){
		// 	return bluetoothle.isConnected(params);
		// },
		// 'isDiscovered': function(params){
		// 	return bluetoothle.isDiscovered(params);
		// },
		'requestConnectionPriority': function(success, error, params){
			bleWrap(bluetoothle.requestConnectionPriority, success, error, params);
		},
		'encodedStringToBytes': function(s){
			return bluetoothle.encodedStringToBytes(s);
		},
		'bytesToEncodedString': function(b){
			return bluetoothle.bytesToEncodedString(b);
		},
		'stringToBytes': function(s){
			return bluetoothle.stringToBytes(s);
		},
		'bytesToString': function(b){
			return bluetoothle.bytesToString(b);
		}
	}

}])

.service('$converter', [function(){

	/*
		The converter service is used to supply various methods that can be used
		to modify data that is going to or from a module via $tiwiBle or $ble.

		Presently it extends the String and Number prototypes, but if needed this
		service could also return other conversion functions.
	*/

	/*
		Converts a base64 encoded string into its Hex (Base16) equivolent. All
		data that goes into and out of $ble is base64 so this is rather useful.

		"base64encodedstring".base64ToHex();
	*/
	String.prototype.base64ToHex = function(){
		var str = this;
		for (var i = 0, bin = atob(str.replace(/[ \r\n]+$/, "")), hex = []; i < bin.length; ++i) {
			var tmp = bin.charCodeAt(i).toString(16);
			if (tmp.length === 1) tmp = "0" + tmp;
			hex[hex.length] = tmp;
		}
		return hex.join("");
	}

	/* 
		Flips the endianness of a hex value.

		"A656".flipEndian() == "56A6";
	*/
	String.prototype.flipEndian = function(){
		var str = this;
		return str.substr(2,2) + str.substr(0,2);
	}

	/*
		Parses a hex number into decimal (base10).

		"1F".hexToDecimal() == 31;
	*/
	String.prototype.hexToDecimal = function(){
		return parseInt(this, 16);
	}

	/*
		Turns an unsigned number with range 0-256 into a signed
		number with range -127 to 127. Numbers outside of this
		range will need a "real" Twos Compliment.

		130.fakeTwosCompliment() == -126;
	*/
	Number.prototype.fakeTwosCompliment = function(){
		if (this>127){
			return this-256;
		}
		return this;
	}

	/*
		Turns a hexadecimal into it's binary eqivolent as a string. Result is in the format:
		{ valid: true/false, result: 'binarystring'}
	*/
	String.prototype.hexToBin = function(){
		var s = this;
	    var i, k, part, ret = '';
	    // lookup table for easier conversion. '0' characters are padded for '1' to '7'
	    var lookupTable = {
	        '0': '0000', '1': '0001', '2': '0010', '3': '0011', '4': '0100',
	        '5': '0101', '6': '0110', '7': '0111', '8': '1000', '9': '1001',
	        'a': '1010', 'b': '1011', 'c': '1100', 'd': '1101',
	        'e': '1110', 'f': '1111',
	        'A': '1010', 'B': '1011', 'C': '1100', 'D': '1101',
	        'E': '1110', 'F': '1111'
	    };
	    for (i = 0; i < s.length; i += 1) {
	        if (lookupTable.hasOwnProperty(s[i])) {
	            ret += lookupTable[s[i]];
	        } else {
	            return { valid: false };
	        }
	    }
	    return { valid: true, result: ret };
	}


	var ret = {}

	return ret;

}]);