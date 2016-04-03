var http = require('http'),
    https = require('https'),
    url = require('url');

function processOptionsRequest(request, response) {
	response.end();
}

function processProxiedRequest(request, response) {
	var options, protocolHandler, proxy_request, requestUrl;

	delete request.headers.host;

	requestUrl = request.headers.__ajax_proxy_url;
	delete request.headers.__ajax_proxy_url;

	options = url.parse(requestUrl);
	options.headers = request.headers;
	options.method = request.method;

	console.log('Requesting');
	console.log('  requestUrl:', requestUrl);
	console.log('  options:', options);

	protocolHandler = options.protocol === 'https:' ? https : http;

	proxy_request = protocolHandler.request(options, function(proxy_response) {
		proxy_response.on('data', function(chunk) {
			response.write(chunk, 'binary');
		});
		proxy_response.on('end', function() {
			response.end();
		});
		response.writeHead(proxy_response.statusCode, proxy_response.headers);
	});
	request.on('data', function(chunk) {
		proxy_request.write(chunk, 'binary');
	});
	request.on('end', function() {
		proxy_request.end();
	});
}

http.createServer(function(request, response) {
	console.log('---');
	console.log('Incoming request');
	console.log('  method:', request.method);
	console.log('  headers:', request.headers);

	// Set up Access Control (CORS) - https://developer.mozilla.org/en-US/docs/Web/HTTP/Access_control_CORS
	response.setHeader('Access-Control-Allow-Origin', '*');
	response.setHeader('Access-Control-Allow-Methods', 'GET, POST, HEAD, OPTIONS');
	response.setHeader('Access-Control-Allow-Headers', '__ajax_proxy_url, Authorization, X-OpenRosa-Version');

	if(request.method === 'OPTIONS') {
		return processOptionsRequest(request, response);
	} else {
		return processProxiedRequest(request, response);
	}
}).listen(8081);
