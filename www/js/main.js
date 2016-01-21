require('angular');

var ncollectApp = angular.module('ncollectApp', []);

ncollectApp.controller('ncollectCtrl',
	['$scope',
	function($scope) {
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
