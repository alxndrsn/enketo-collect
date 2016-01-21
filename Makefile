.PHONY: default init www www-build www-serve

default: www
	
init:
	npm install -g http-server

www: www-build www-serve

www-serve:
	http-server .
