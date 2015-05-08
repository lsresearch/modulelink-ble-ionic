angular.module('ble', [])

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