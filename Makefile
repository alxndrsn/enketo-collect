.PHONY: default init www www-build www-serve

default: www
	
init:
	npm install -g browserify http-server

www: www-build www-serve

www-build:
	rm -rf build/www
	mkdir -p build/www
	cp -r www/static/* build/www/
	mkdir build/www/enketo
	cp -r node_modules/enketo-client-side-transformer/xslt/client-side/*.xsl build/www/enketo
	browserify www/js/main.js -o build/www/bundle.js

www-serve:
	http-server build/www
