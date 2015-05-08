angular.module('serial-stack', ['ble'])

.service('$serialStack', ['$ble', '$q', function($ble, $q){

	var SERIAL_UUID = "3347ab00-fb94-11e2-a8e4-f23c91aec05e";
	var SERIAL_ACCEPT = "3347ab03-fb94-11e2-a8e4-f23c91aec05e"; // true if device can send to phone
	var SERIAL_DATA = "3347ab01-fb94-11e2-a8e4-f23c91aec05e";
	var SERIAL_SEND_DATA = "3347ab02-fb94-11e2-a8e4-f23c91aec05e";
	var SERIAL_RECEIVE = "3347ab04-fb94-11e2-a8e4-f23c91aec05e"; // true if phone can send to device

	var address = "";
	var executionStack = [];
	var serialReceive = true;
	var pendingSerialReceive = false;
	var emptyStack = false;

	function nextStackCall(){
		if (executionStack.length == 0){
			emptyStack = true;
			return;
		}
		var next = executionStack[0];
		if (next.waitForSerialReceive == true){
			if (serialReceive){
				nextStackCall_execute();
			}else{
				pendingSerialReceive = true;
			}
		}else{
			nextStackCall_execute();
		}
	}

	function nextStackCall_execute(){
		var next = executionStack.shift();
		next.execute();
	}

	function addBleStackCall(command, success, failure, params, waitForSerialReceive){

		executionStack.push({
			'waitForSerialReceive': waitForSerialReceive,
			'execute': function(){
				command.apply(this, [function(resp){
					if (command == $ble.subscribe){
						if (resp.status == "subscribed"){
							console.log("SUBSCRIBED", resp);
							nextStackCall();
						}else{
							success(resp);
						}
					}else{
						success(resp);
						nextStackCall();
					}
				}, function(resp){
					failure(resp);
					nextStackCall();
				}, params]);
			}
		});

		if (emptyStack){
			emptyStack = false;
			nextStackCall();
		}

	}

	function setSerialAccept(val){
		var deferred = $q.defer();
		addBleStackCall($ble.write, function(){
			// console.log("SERIAL_ACCEPT", val);
			deferred.resolve();
		}, function(resp){
			console.error("SERIAL_ACCEPT", val, resp);
			deferred.reject();
		}, {
			"address": address,
			"serviceUuid": SERIAL_UUID,
			"characteristicUuid": SERIAL_ACCEPT,
			"value": $ble.bytesToEncodedString([val])
		}, false);
		return deferred.promise;
	}

	return {
		'startStack': function(addr, onData, onFinish){
			address = addr;
			executionStack = [];
			serialReceive = true;
			pendingSerialReceive = false;
			emptyStack = false;

			// Setup the initial stack

			setSerialAccept(0);

			addBleStackCall($ble.subscribe, function(resp){
				serialReceive = (resp.value == "AQ==");
				// console.log("SERIAL_RECEIVE", serialReceive);
				if (pendingSerialReceive && serialReceive){
					pendingSerialReceive = false;
					nextStackCall();
				}
			}, function(){
				console.error("SERIAL_RECEIVE");
			}, {
				"address": address,
				"serviceUuid": SERIAL_UUID,
				"characteristicUuid": SERIAL_RECEIVE
			}, false);

			addBleStackCall($ble.write, function(resp){
				console.log("Sent 2,1,1", resp);
			}, function(){
				console.error("Sent 2,1,1");
			}, {
				"address": address,
				"serviceUuid": SERIAL_UUID,
				"characteristicUuid": SERIAL_SEND_DATA,
				"value": $ble.bytesToEncodedString($ble.stringToBytes("2,1,1"))
			}, true);

			addBleStackCall($ble.write, function(resp){
				console.log("Sent 6,1,1", resp);
			}, function(){
				console.error("Sent 6,1,1");
			}, {
				"address": address,
				"serviceUuid": SERIAL_UUID,
				"characteristicUuid": SERIAL_SEND_DATA,
				"value": $ble.bytesToEncodedString($ble.stringToBytes("6,1,1"))
			}, true);

			addBleStackCall($ble.subscribe, function(resp){
				setSerialAccept(0).then(function(){
					onData(resp);
					setSerialAccept(1);
				});

				// var startTime = Date.now();

				// $ble.write(function(){
				// 	onData(resp);
				// 	$ble.write(function(){
				// 		console.log("TIME FOR LOOP", (Date.now() - startTime));
				// 	}, function(resp){
				// 		console.error("SERIAL_ACCEPT", resp);
				// 	}, {
				// 		"address": address,
				// 		"serviceUuid": SERIAL_UUID,
				// 		"characteristicUuid": SERIAL_ACCEPT,
				// 		"value": $ble.bytesToEncodedString([1]),
				// 		// "type": "noresponse"
				// 	});
				// }, function(resp){
				// 	console.error("SERIAL_ACCEPT", resp);
				// }, {
				// 	"address": address,
				// 	"serviceUuid": SERIAL_UUID,
				// 	"characteristicUuid": SERIAL_ACCEPT,
				// 	"value": $ble.bytesToEncodedString([0]),
				// 	// "type": "noresponse"
				// });


			}, function(){
				console.error("SERIAL_DATA");
			}, {
				"address": address,
				"serviceUuid": SERIAL_UUID,
				"characteristicUuid": SERIAL_DATA
			});

			setSerialAccept(1).then(function(){
				if (typeof onFinish !== "undefined") onFinish();	
			});

			nextStackCall();

		},
		'changeLED': function(val){
			addBleStackCall($ble.write, function(resp){
				console.log("Set LED to", val);
			}, function(resp){
				console.error("Failed to set LED", resp);
			}, {
				"address": address,
				"serviceUuid": SERIAL_UUID,
				"characteristicUuid": SERIAL_SEND_DATA,
				"value": $ble.bytesToEncodedString($ble.stringToBytes("5,1,"+val))
			}, true);
		}
	}

}])