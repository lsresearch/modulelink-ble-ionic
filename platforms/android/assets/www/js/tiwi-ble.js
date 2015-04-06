angular.module('tiwi-ble', [])

.service('$tiwiBle', ['$ble', '$timeout', '$rootScope', '$converter', '$interval', function($ble, $timeout, $rootScope, $c, $interval){

	var validNames = ["SaBLE-x","TiWi-uB1","LSR-BLE"];
	var devices = {}, scanning = false, currentDevice, SCAN_LIMIT = 10000, rssiInterval;

	var GPIO_UUID = "3347aaa0-fb94-11e2-a8e4-f23c91aec05e";
	var GPIO_LED = "3347aaa4-fb94-11e2-a8e4-f23c91aec05e";
	var GPIO_BUTTON = "3347aaa3-fb94-11e2-a8e4-f23c91aec05e";

	var BATTERY_UUID = "180F";
	var BATTERY_VOLTAGE = "2A19";

	var TEMP_UUID = "3347aac0-fb94-11e2-a8e4-f23c91aec05e";
	var TEMP_DATA = "3347aac1-fb94-11e2-a8e4-f23c91aec05e";
	var TEMP_CONF = "3347aac2-fb94-11e2-a8e4-f23c91aec05e";

	var RANGE_UUID = "3347aab0-fb94-11e2-a8e4-f23c91aec05e";
	var RANGE_RSSI = "3347aab1-fb94-11e2-a8e4-f23c91aec05e";
	var RANGE_PACKETS = "3347aab2-fb94-11e2-a8e4-f23c91aec05e";

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
				console.log(devices[address]);
				subscribeLoop(address);
			}

		}, function(resp){
			console.log("Fail characteristics :(");
		}, {
			"address": address,
			"serviceUuid": devices[address].serviceUuids[devices[address].onService]
		});

	}

	var subscribeLoop = function(address){

		var nextSubscribe = function(){
			devices[address].onSubscribe++
			if (devices[address].onSubscribe < 6){
				subscribeLoop(address);
			}else{
				// ret.changeLED(address, 3);
				devices[address].connected = true;
				console.log("FINISHED", devices);
			}
		}

		switch(devices[address].onSubscribe){
			case 0:

				$ble.subscribe(function(resp){

					if (resp.status=="subscribed"){
						nextSubscribe();
						return;
					}

					devices[address].model.voltage = resp.value.base64ToHex().flipEndian().hexToDecimal()/1000;

				}, function(resp){
					console.log("FAIL VOLTAGE :(", resp);
				}, {
					"address": address,
					"serviceUuid": BATTERY_UUID,
					"characteristicUuid": BATTERY_VOLTAGE
				});

				break;

			case 1:

				$ble.write(function(resp){

					console.log("TEMP CONF ON", resp);

					$ble.subscribe(function(resp){

						if (resp.status=="subscribed"){
							nextSubscribe();
							return;
						}

						devices[address].model.temp = resp.value.base64ToHex().flipEndian().hexToDecimal();
						devices[address].model.tempC = devices[address].model.temp / 256;
						devices[address].model.tempF = (devices[address].model.tempC * 1.8)+32;

					}, function(resp){
						console.log("FAIL TEMP :(", resp);
					}, {
						"address": address,
						"serviceUuid": TEMP_UUID,
						"characteristicUuid": TEMP_DATA
					});

				}, function(resp){
					console.log("TEMP CONF FAIL", resp);
				}, {
					"address": address,
					"serviceUuid": TEMP_UUID,
					"characteristicUuid": TEMP_CONF,
					"value": $ble.bytesToEncodedString([1])
				});

				break;

			case 2:

				$ble.subscribe(function(resp){

					if (resp.status=="subscribed"){
						nextSubscribe();
						return;
					}

					devices[address].model.button = (resp.value == "AQ==");

				}, function(resp){
					console.log("FAIL BUTTON :(", resp);
				}, {
					"address": address,
					"serviceUuid": GPIO_UUID,
					"characteristicUuid": GPIO_BUTTON
				});

				break;

			case 3:

				$ble.subscribe(function(resp){

					if (resp.status=="subscribed"){
						nextSubscribe();
						return;
					}

					devices[address].model.moduleRSSI = resp.value.base64ToHex().hexToDecimal().fakeTwosCompliment();

				}, function(resp){
					console.log("FAIL RSSI :(", resp);
				}, {
					"address": address,
					"serviceUuid": RANGE_UUID,
					"characteristicUuid": RANGE_RSSI
				});

				break;

			case 4:

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
					console.log("FAIL PACKETS :(", resp);
				}, {
					"address": address,
					"serviceUuid": RANGE_UUID,
					"characteristicUuid": RANGE_PACKETS
				});

				break;

			case 5:

				rssiInterval = $interval(function(){

					$ble.rssi(function(resp){

						devices[address].model.phoneRSSI = resp.rssi;

					}, function(resp){
						console.log("Phone RSSI FAILED :(");
						$interval.cancel(rssiInterval);
					}, {
						"address": address
					})

				}, 2000);

				nextSubscribe();

				break;

		}

	}

	var doneScanning = function(){
		scanning = false;
		$rootScope.$broadcast('scroll.refreshComplete');
	}

	var ret = {
		'startScan': function(){

			if (scanning) return;

			scanning = true;

			$ble.initialize(function(resp){

			  	if (resp.status == "enabled"){

			  		// for (prop in devices) { if (devices.hasOwnProperty(prop)) { delete devices[prop]; } }

			  		$ble.startScan(function(resp){
			  			if (typeof devices[resp.address] === "undefined"){
			  				if (validNames.indexOf(resp.name) == -1) return;
			  				devices[resp.address] = resp;
			  			}else{
			  				devices[resp.address].rssi = resp.rssi;
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
		'stopScan': function(){
			doneScanning();
			$ble.stopScan();
		},
		'connect': function(address){

			var connectCallback = function(resp){

				console.log("CONNECTED!", resp);

				if (resp.status == "connected"){

					function initDevice(){
						devices[address].serviceUuids = resp.serviceUuids;
						devices[address].disconnected = false;
						devices[address].services = [];
						devices[address].model = {
							'led': 0,
							'voltage': 0,
							'temp': 0,
							'tempF': 0,
							'tempC': 0,
							'button': false,
							'moduleRSSI': 0,
							'phoneRSSI': devices[address].rssi,
							'packets': 0,
							'packetsReceived': 0
						};
						devices[address].onService = 0;
						devices[address].onSubscribe = 0;
					}

					currentDevice = address;

					if (ionic.Platform.isIOS()){

						$ble.services(function(resp){

							initDevice();
							characteristicLoop(address);

						}, function(resp){
							console.log("Fail services :(");
						}, {
							"address": address
						});

					}else{

						$ble.discover(function(resp){

							initDevice();
							subscribeLoop(address);

						}, function(resp){

						}, {
							"address": address
						});

					}

				}else if (resp.status == "disconnected"){
					
					devices[address].disconnected = true;
					devices[address].connected = false;

				}

			}

			if (devices[address].disconnected){

				$ble.reconnect(connectCallback, function(resp){
					console.log("Failure Reconnecting :(");
				}, {
					"address": address
				})

			}else{

				$ble.connect(connectCallback, function(resp){
					console.log("Failure Connecting :(");
				}, {
					"address": address
				});

			}
		},
		'changeLED': function(address, value){
			$ble.write(function(resp){
				devices[address].model.led = value;
				console.log("SUCCESS LED", resp);
			}, function(resp){
				console.log("FAILED LED", resp);
			}, {
				"address": address,
				"serviceUuid": GPIO_UUID,
				"characteristicUuid": GPIO_LED,
				"value": btoa(value)
			})
		},
		'disconnect': function(address){
			$ble.disconnect(function(resp){
				console.log("Disconnect Success");
				devices[address].disconnected = true;
				devices[address].connected = false;
				$interval.cancel(rssiInterval);
			}, function(resp){
				console.log("Couldn't Disconnect :(");
			}, {
				'address': address
			});
		},
		'devices': devices,
		'currentDeviceID': function(){
			return currentDevice;
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
		// 'requestConnectionPriority': function(success, error, params){
		// 	bleWrap(bluetoothle.requestConnectionPriority, success, error, params);
		// },
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

	String.prototype.base64ToHex = function(){
		var str = this;
		for (var i = 0, bin = atob(str.replace(/[ \r\n]+$/, "")), hex = []; i < bin.length; ++i) {
			var tmp = bin.charCodeAt(i).toString(16);
			if (tmp.length === 1) tmp = "0" + tmp;
			hex[hex.length] = tmp;
		}
		return hex.join("");
	}

	String.prototype.flipEndian = function(){
		var str = this;
		return str.substr(2,2) + str.substr(0,2);
	}

	String.prototype.hexToDecimal = function(){
		return parseInt(this, 16);
	}

	Number.prototype.fakeTwosCompliment = function(){
		// This will only work for an integer from a single byte.
		if (this>127){
			return this-256;
		}
		return this;
	}

	var ret = {}

	return ret;

}]);