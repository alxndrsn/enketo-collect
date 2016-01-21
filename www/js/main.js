require('angular');

var ncollectApp = angular.module('ncollectApp', []);

ncollectApp.controller('ncollectCtrl',
	['$scope',
	function($scope) {
		$scope.showSettings = function() { $scope.settingsVisible = true; }
		$scope.hideSettings = function() { $scope.settingsVisible = false; }
	}
]);

ncollectApp.controller('mainMenuCtrl',
	['$scope',
	function($scope) {
		$scope.menuItems = [
			'Fill Blank Form',
			'Edit Saved Form',
			'Send Finalised Form',
			null,
			'Get Blank Form',
			'Delete Saved Form',
		];
	}
]);

ncollectApp.controller('settingsCtrl',
	['$scope',
	function($scope) {
		$scope.version = '___VERSION___';
	}
]);
