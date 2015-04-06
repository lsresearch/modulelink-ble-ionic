angular.module('controllers', [])

/*
	This controller is for the "Home Screen" where users can scan for devices. It uses
	partials/devices.html as a template.
*/
.controller('DevicesCtrl', ['$scope', '$timeout', '$tiwiBle', function($scope, $timeout, $tiwiBle) {

	/*
		Here we add the object of devices from $tiwiBle to $scope so that we have access
		to them in the devices.html template.
	*/
	$scope.devices = $tiwiBle.devices;

	/*
		The following functions trigger off a scan in $tiwiBle and stop that scan. When
		starting we also mark all devices already found as "stale" and they are removed
		from the list until they are found in the new scan.

		stopScan also makes sure to broadcast the refreshComplete event so that the
		"pull down to refresh" spinner disappears.
	*/
	$scope.startScan = function(){
		$tiwiBle.staleDevices();
		$tiwiBle.startScan();
	}
	$scope.stopScan = function(){
		$scope.$broadcast('scroll.refreshComplete');
		$tiwiBle.stopScan();
	}

	/*
		Add the isScanning function to the $scope so that we can check it in our template
		and replace the "Start Scan" button with a "Stop Scan" button.
	*/
	$scope.isScanning = $tiwiBle.isScanning;

}])

/*
	This controller is in charge of the page for each specific device. It takes in the device
	ID for the device to be shown within $stateParams.did. It uses partials/device.html as
	its template.
*/
.controller('DeviceCtrl', ['$scope', '$tiwiBle', '$stateParams', function($scope, $tiwiBle, $stateParams){

	var did = $stateParams.did;

	// Here we use $tiwiBle to actually connect to the device and assign that device to scope.
	$tiwiBle.connect(did);
	$scope.device = $tiwiBle.devices[did];

	/*
		This data and changeLED function is in charge of managing each of the LED toggles and
		in turn sending off the changeLED command to the device.
	*/
	$scope.data = {
		'greenLED': false,
		'redLED': false
	}
	var changeLED = function(){

		if (!$scope.device.connected) return;

		var ledStatus = 0;

		if ($scope.data.greenLED && $scope.data.redLED){
			ledStatus = 3;
		}else if ($scope.data.greenLED){
			ledStatus = 2;
		}else if ($scope.data.redLED){
			ledStatus = 1;
		}

		$tiwiBle.changeLED(did, ledStatus);

	}

	// When the data is toggled, we kick off the changeLED function from above.
	$scope.$watch('data.greenLED', changeLED);
	$scope.$watch('data.redLED', changeLED);

}]);
