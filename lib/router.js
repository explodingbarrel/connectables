//"use strict";

var url = require('url');
var querystring = require('querystring'),
	reOptionalSection = /\?$/,
	reParameter = /^\:(.*?)\??$/,
	reWildcard = /\*/;

/* helper functions */

function genMethodRegex(method) {
	if (method == 'all') {
		return;
	}
	
	if (method instanceof RegExp) {
		return method;
	} // if
	
	if (typeof method == 'string') {
		return new RegExp('^' + method + '$', 'i');
	} // if
} // genMethodRegex

function normalizePath(path, keys) {
	  path = path
		.concat('/?')
		.replace(/\/\(/g, '(?:/')
		.replace(/(\/)?(\.)?:(\w+)(?:(\(.*?\)))?(\?)?/g, function(_, slash, format, key, capture, optional){
		  keys.push(key);
		  slash = slash || '';
		  return ''
			+ (optional ? '' : slash)
			+ '(?:'
			+ (optional ? slash : '')
			+ (format || '') + (capture || '([^/]+?)') + ')'
			+ (optional || '');
		})
		.replace(/([\/.])/g, '\\$1')
		.replace(/\*/g, '(.+)');
	  return new RegExp('^' + path + '$', 'i');
}

function genRule(path) {
	// if the path already is a regex then send it back
	if (path instanceof RegExp) {
		return {
			regex: path
		};
	} // if
	
	var keys = [];
	var regex = normalizePath(path,keys);
	
	return {  regex:regex, keys:keys, path:path };

} // genRegex


/* Router prototype */

function Router( options ) {
	options = options || {};
	this.registry = [];
	this.use_path_as_normalizedurl = options.use_path_as_normalizedurl || false;
} // Router

Router.prototype.matches = function(req,path) {
	var matches = [];
	
	// look through the registry for a matching request
	this.registry.forEach(function(rule) {
		// perform regex matches using test as its a bit faster than exec
		// (according to benchmarks on jsperf.com: http://jsperf.com/test-vs-exec)
		var matchOK = rule.regex && rule.regex.test(path) && 
			 ((! rule.method) || rule.method.test(req.method));
		
		if (matchOK) {
			matches[matches.length] = rule;
		}
	});
	
	return matches;
};

Router.prototype.add = function(path, handler, method) {
	var rule = genRule(path);
	
	// add the handler and method information
	rule.handler = handler;
	rule.method = genMethodRegex(method);
	
	// add to the registry
	this.registry.push(rule);
}; // add

Router.prototype.init = function() {
	var router = this;
	
	return function(req, res, next) {
		
		var uri = url.parse(req.url||'');   
		var orig = url.parse(req.originalUrl||'');
		var rule = router.matches(req,uri.pathname)[0];
		var captures;
		var params = {};
	
		// if we have a rule, then go about preparing adding valid params
		if (rule && rule.handler) {
			// if the rule has parameters then extract those from the url
			if (rule.keys) {
				
				captures = rule.regex.exec(uri.pathname);
				
				for (var j = 1, len = captures.length; j < len; ++j) {
					var key = rule.keys[j-1],
					val = typeof captures[j] === 'string' ? decodeURIComponent(captures[j]) : captures[j];
					if (key) {  
						params[key] = val;
					} 
				}
			}
			
			// patch the parameters into the request
			req.params = params;
			
			if (uri.pathname == '/'){
				uri.pathname = '';
			} 
			var baseUrl = orig.pathname.substr(0,orig.pathname.length-uri.pathname.length);
			if( router.use_path_as_normalizedurl === true ) {
				req.normalizedUrl = baseUrl + uri.pathname;
			}
			else {
				req.normalizedUrl = baseUrl + rule.path;
			}
			if( process.setRequestName != null ) {
				process.setRequestName( req );
			}
			
			// now execute the handler
			rule.handler.call(router, req, res, next);
		} // if
		else {
			return next();
		}
	};
}; // handleRequest

['get', 'put', 'post', 'delete', 'head', 'all'].forEach(function(method) {
	Router.prototype[method] = function(path, handler) {
		return this.add(path, handler, method);
	};
});

/* exports */

module.exports = function(routerInitFn, options) {
	// create the router
	var router = new Router( options );

	// call the router initialization function
	if (routerInitFn) {
		routerInitFn(router);
	} // if
	
	return routerInitFn ? router.init() : router;
};