.PHONY: default init www www-build www-serve www-clean www-static www-xslt www-enketo-styles www-styles www-js www-minify stats

ADB = ${ANDROID_HOME}/platform-tools/adb
EMULATOR = ${ANDROID_HOME}/tools/emulator
GRADLEW = ./gradlew --daemon --parallel --stacktrace
JSHINT = ./node_modules/jshint/bin/jshint

ifdef ComSpec	 # Windows
  # Use `/` for all paths, except `.\`
  ADB := $(subst \,/,${ADB})
  EMULATOR := $(subst \,/,${EMULATOR})
  GRADLEW := $(subst /,\,${GRADLEW})
endif

default: android
	
init:
	npm install -g http-server

browse:
	open http://localhost:8080 || firefox http://localhost:8080

www: www-build
	foreman start

jshint:
	${JSHINT} ajax-proxy/*.js
	${JSHINT} www/js/*.js

www-clean:
	rm -rf build/www
	mkdir -p build/www

www-static:
	echo '[www-static] Copying static files...'
	cp -r www/static/* build/www/

www-xslt:
	echo '[www-xslt] Copying XSLTs...'
	mkdir build/www/enketo
	cp -r node_modules/enketo-client-side-transformer/xslt/client-side/*.xsl build/www/enketo

www-enketo-styles:
	echo '[www-enketo-styles] Sassing...'
	grunt enketo-sass
	mkdir -p build/less
	cp build/sass/formhub.css build/less/enketo.less
	echo '[www-enketo-styles] Fixing font paths...'
	sed -i'.bak' 's_/build/fonts/_fonts/_' build/less/enketo.less
	echo '[www-enketo-styles] Copying fonts...'
	mkdir -p build/www/fonts
	cp node_modules/enketo-core/build/fonts/* build/www/fonts/

www-styles: www-enketo-styles
	echo '[www-styles] Compiling stylesheets...'
	./node_modules/less/bin/lessc www/style/main.less build/www/style.css

www-js:
	echo '[www-js] Concatting JS...'
	./node_modules/browserify/bin/cmd.js www/js/main.js -o build/www/bundle.js
	echo '[www-js] Compiling templates...'
	grunt compile-templates
	cat build/templates.js >> build/www/bundle.js

www-build: ${JSHINT} www-clean www-static www-xslt www-styles www-js

www-minify:
	cp -r build/www/ build/www.min
	echo '[www-minify] Minifying JS...'
	uglify -s build/www/bundle.js -o build/www.min/bundle.js
	echo '[www-minify] Minifying CSS...'
	uglify -c -s build/www/style.css -o build/www.min/style.css

.PHONY: android android-assets android-clean android-deploy android-emulator android-kill android-logs android-prod

android: android-clean android-assets android-deploy android-logs
android-prod: android-clean android-prod-assets android-deploy

android-assets: www-build
	mkdir -p android/src/main/assets
	cp -r build/www android/src/main/assets/www

android-prod-assets: www-build www-minify
	mkdir -p android/src/main/assets
	cp -r build/www.min android/src/main/assets/www

android-clean:
	cd android && rm -rf src/main/assets/
	cd android && rm -rf build/outputs/apk/

android-emulator:
	nohup ${EMULATOR} -avd test -wipe-data > emulator.log 2>&1 &
	${ADB} wait-for-device

android-logs:
	${ADB} logcat EnketoCollect:V AndroidRuntime:E '*:S' | tee android.log

android-deploy:
	cd android && ${GRADLEW} installDebug

android-kill:
	pkill -9 emulator64-arm

stats:
	./scripts/project_stats

.PHONY: travis

travis: jshint android-assets
	cd android && ${GRADLEW} test assembleDebug
