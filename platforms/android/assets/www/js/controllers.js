angular.module('controllers', [])

.controller('DevicesCtrl', ['$scope', '$timeout', '$tiwiBle', function($scope, $timeout, $tiwiBle) {

	$scope.devices = $tiwiBle.devices;

	$scope.bluetooth = function(){
		$tiwiBle.startScan();
	}

	$scope.stopBluetooth = function(){
		$scope.$broadcast('scroll.refreshComplete');
		$tiwiBle.stopScan();
	}

}])

.controller('DeviceCtrl', ['$scope', '$tiwiBle', '$stateParams', function($scope, $tiwiBle, $stateParams){

	var did = $stateParams.did;

	$tiwiBle.connect(did);

	$scope.device = $tiwiBle.devices[did];

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

	$scope.$watch('data.greenLED', changeLED);
	$scope.$watch('data.redLED', changeLED);

}]);
