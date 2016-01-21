.PHONY: default init www www-build www-serve

default: www
	
init:
	npm install -g browserify http-server

www: www-build www-serve

www-build:
	rm -rf build/www
	mkdir -p build/www
	cp -r www/static/* build/www/
	browserify www/js/main.js -o build/www/bundle.js

www-serve:
	http-server .
