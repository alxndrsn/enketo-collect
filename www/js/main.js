require('angular');
require('lodash');

var ncollectApp = angular.module('ncollectApp', []);

ncollectApp.controller('ncollectCtrl',
	['$scope',
	function($scope) {
		$scope.showSettings = function() { $scope.settingsVisible = true; };
		$scope.hideSettings = function() { $scope.settingsVisible = false; };

		$scope.showFormFetch = function() { $scope.formFetchVisible = true; };
		$scope.hideFormFetch = function() { $scope.formFetchVisible = false; };
	}
]);

ncollectApp.controller('mainMenuCtrl',
	['$scope',
	function($scope) {
	}
]);

ncollectApp.controller('settingsCtrl',
	['$scope',
	function($scope) {
		$scope.version = '___VERSION___';
		$scope.serverUrl = 'http://localhost:8080/';
	}
]);

ncollectApp.controller('formFetchCtrl',
	['$http', '$scope',
	function($http, $scope) {
		function ona2local(ona) {
			return _.pick(ona, ['title', 'url']);
		}

		$scope.refreshAvailable = function() {
			$scope.loading = true;
			delete $scope.availableForms;
			$scope.download = {};

			$http.get('/samples/ona/api/v1/forms?owner=mr_alex')
				.then(function(res) {
					$scope.loading = false;
					$scope.availableForms = _.map(res.data, ona2local);
					_.each($scope.availableForms, function(f) {
						$scope.download[f.url] = false;
					});
				});
		};

		$scope.toggleAll = function() {
			var select = true;
			if(_.every(_.values($scope.download))) {
				select = false;
			}
			_.each(_.keys($scope.download), function(d) {
				$scope.download[d] = select;
			});
		}

		$scope.refreshAvailable();
	}
]);
