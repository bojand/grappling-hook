/*!
 * grappling-hook
 * https://github.com/keystonejs/grappling-hook
 *
 * Copyright 2015-2016 Keystone.js
 * Released under the MIT license
 *
 */

'use strict';

/**
 * Middleware are callbacks that will be executed when a hook is called. The type of middleware is determined through the parameters it declares.
 * @example
 * function(){
 *   //synchronous execution
 * }
 * @example
 * function(){
 *   //create promise, i.e. further execution is halted until the promise is resolved.
 *   return promise;
 * }
 * @example
 * function(next){
 *   //asynchronous execution, i.e. further execution is halted until `next` is called.
 *   setTimeout(next, 1000);
 * }
 * @example
 * function(next, done){
 *   //asynchronous execution, i.e. further execution is halted until `next` is called.
 *   setTimeout(next, 1000);
 *   //full middleware queue handling is halted until `done` is called.
 *   setTimeout(done, 2000);
 * }
 * @callback middleware
 * @param {...*} [parameters] - parameters passed to the hook
 * @param {function} [next] - pass control to the next middleware
 * @param {function} [done] - mark parallel middleware to have completed
 */

/**
 * @typedef {Object} options
 * @property {Boolean} [strict=true] - Will disallow subscribing to middleware bar the explicitly registered ones.
 * @property {Object} [qualifiers]
 * @property {String} [qualifiers.pre='pre'] - Declares the 'pre' qualifier
 * @property {String} [qualifiers.post='post'] - Declares the 'post' qualifier
 * @property {Function} [createThenable=undefined] - Set a Promise A+ compliant factory function for creating promises.
 * @example
 * //creates a GrapplingHook instance with `before` and `after` hooking
 * var instance = grappling.create({
 *   qualifiers: {
 *     pre: 'before',
 *     post: 'after'
 *   }
 * });
 * instance.before('save', console.log);
 * @example
 * //creates a GrapplingHook instance with a promise factory
 * var P = require('bluebird');
 * var instance = grappling.create({
 *   createThenable: function(fn){
 *     return new P(fn);
 *   }
 * });
 * instance.allowHooks('save');
 * instance.pre('save', console.log);
 * instance.callThenableHook('pre:save', 'Here we go!').then(function(){
 *   console.log('And finish!');
 * });
 * //outputs:
 * //Here we go!
 * //And finish!
 */

/**
 * The GrapplingHook documentation uses the term "thenable" instead of "promise", since what we need here is not _necessarily_ a promise, but a thenable, as defined in the <a href="https://promisesaplus.com/">Promises A+ spec</a>.
 * Thenable middleware for instance can be _any_ object that has a `then` function.
 * Strictly speaking the only instance where we adhere to the full Promises A+ definition of a promise is in {@link options}.createThenable.
 * For reasons of clarity, uniformity and symmetry we chose `createThenable`, although strictly speaking it should've been `createPromise`.
 * Most people would find it confusing if part of the API uses 'thenable' and another part 'promise'.
 * @typedef {Object} thenable
 * @property {Function} then - see <a href="https://promisesaplus.com/">Promises A+ spec</a>
 * @see {@link options}.createThenable
 * @see {@link module:grappling-hook.isThenable isThenable}
 */

const _ = require('lodash');
let async = {};

/*!
 *=====================================
 * Parts copied from/based on         *
 *=====================================
 *
 * async
 * https://github.com/caolan/async
 *
 * Copyright 2010-2014 Caolan McMahon
 * Released under the MIT license
 */
/**
 *
 * @param {{}} tasks - MUST BE OBJECT
 * @param {function} callback
 */
async.series = function(tasks, callback) {
	callback = callback || _.noop;
	const results = {};
	async.eachSeries(_.keys(tasks), function(k, callback) {
		tasks[k](function(err) {
			//optimised to avoid arguments leakage
			let args = new Array(arguments.length);
			for (let i = 1; i < args.length; i++) {
				args[i] = arguments[i];
			}
			if (args.length <= 1) {
				args = args[0];
			}
			results[k] = args;
			callback(err);
		});
	}, function(err) {
		callback(err, results);
	});
};
/**
 *
 * @param {[]} arr
 * @param {function} iterator
 * @param {function} callback
 * @returns {*}
 */
async.eachSeries = function(arr, iterator, callback) {
	callback = callback || _.noop;
	if (!arr.length) {
		return callback();
	}
	let completed = 0;
	const iterate = function() {
		iterator(arr[completed], function(err) {
			if (err) {
				callback(err);
				callback = _.noop;
			}
			else {
				completed += 1;
				if (completed >= arr.length) {
					callback();
				}
				else {
					iterate();
				}
			}
		});
	};
	iterate();
};
/*!
 *=====================================
 */

const presets = {};

function parseHook(hook) {
	const parsed = (hook)
		? hook.split(':')
		: [];
	const n = parsed.length;
	return {
		type: parsed[n - 2],
		name: parsed[n - 1]
	};
}

/**
 *
 * @param instance - grappling-hook instance
 * @param hook - hook
 * @param args
 * @private
 */
function addMiddleware(instance, hook, args) {
	const cache = instance.__grappling;
	let mwOpts = {
		passParams: true
	};
	if(_.isPlainObject(args[args.length - 1])) {
		mwOpts = _.defaults(args.pop(), mwOpts);
	}
	const fns = _.flatten(args);
	let mw = [];
	if (!cache.middleware[hook]) {
		if (cache.opts.strict) throw new Error('Hooks for ' + hook + ' are not supported.');
	} else {
		mw = cache.middleware[hook];
	}
	cache.middleware[hook] = mw.concat(fns);
	cache.mwopts[hook] = mwOpts;
}

function attachQualifier(instance, qualifier) {
	/**
	 * Registers `middleware` to be executed _before_ `hook`.
	 * This is a dynamically added method, that may not be present if otherwise configured in {@link options}.qualifiers.
	 * @method pre
	 * @instance
	 * @memberof GrapplingHook
	 * @param {string} hook - hook name, e.g. `'save'`
	 * @param {(...middleware|middleware[])} [middleware] - middleware to register
	 * @returns {GrapplingHook|thenable} the {@link GrapplingHook} instance itself, or a {@link thenable} if no middleware was provided.
	 * @example
	 * instance.pre('save', function(){
	 *   console.log('before saving');
	 * });
	 * @see {@link GrapplingHook#post} for registering middleware functions to `post` hooks.
	 */
	/**
	 * Registers `middleware` to be executed _after_ `hook`.
	 * This is a dynamically added method, that may not be present if otherwise configured in {@link options}.qualifiers.
	 * @method post
	 * @instance
	 * @memberof GrapplingHook
	 * @param {string} hook - hook name, e.g. `'save'`
	 * @param {(...middleware|middleware[])} [middleware] - middleware to register
	 * @returns {GrapplingHook|thenable} the {@link GrapplingHook} instance itself, or a {@link thenable} if no middleware was provided.
	 * @example
	 * instance.post('save', function(){
	 *   console.log('after saving');
	 * });
	 * @see {@link GrapplingHook#pre} for registering middleware functions to `post` hooks.
	 */
	instance[qualifier] = function() {
		let fns = _.toArray(arguments);
		const hookName = fns.shift();
		let output;
		if (fns.length) { //old skool way with callbacks
			output = this;
		} else {
			output = this.__grappling.opts.createThenable(function(resolve) {
				fns = [resolve];
			});
		}
		addMiddleware(this, qualifier + ':' + hookName, fns);
		return output;
	};
}

function init(name, opts) {
	if (arguments.length === 1 && _.isObject(name)) {
		opts = name;
		name = undefined;
	}
	let presets;
	if (name) {
		presets = module.exports.get(name);
	}
	this.__grappling = {
		middleware: {},
		mwopts: {},
		opts      : _.defaults({}, opts, presets, {
			strict        : true,
			qualifiers    : {
				pre : 'pre',
				post: 'post'
			},
			createThenable: function() {
				throw new Error('Instance not set up for thenable creation, please set `opts.createThenable`');
			}
		})
	};
	const q = this.__grappling.opts.qualifiers;
	attachQualifier(this, q.pre);
	attachQualifier(this, q.post);
}

/*
 based on code from Isaac Schlueter's blog post:
 http://blog.izs.me/post/59142742143/designing-apis-for-asynchrony
 */
function dezalgofy(fn, done) {
	let isSync = true;
	fn(safeDone); //eslint-disable-line no-use-before-define
	isSync = false;
	function safeDone() {
		const args = arguments;
		if (isSync) {
			process.nextTick(function() {
				done.apply(null, args);
			});
		} else {
			done.apply(null, args);
		}
	}
}

function iterateAsyncMiddleware(context, middleware, args, done) {
	done = done || function(err) {
			/* istanbul ignore next: untestable */
			if (err) {
				throw err;
			}
		};
	let asyncFinished = false;
	const waiting = [];
	const wait = function(callback) {
		waiting.push(callback);
		return function(err) {
			waiting.splice(waiting.indexOf(callback), 1);
			if (asyncFinished !== done) {
				if (err || (asyncFinished && !waiting.length)) {
					done(err);
				}
			}
		};
	};
	async.eachSeries(middleware, function(callback, next) {
		const d = callback.length - args.length;
		switch (d) {
			case 1: //async series
				callback.apply(context, args.concat(next));
				break;
			case 2: //async parallel
				callback.apply(context, args.concat(next, wait(callback)));
				break;
			default :
				//synced
				let err;
				let result;
				try {
					result = callback.apply(context, args);
				} catch (e) {
					err = e;
				}
				if (!err && module.exports.isThenable(result)) {
					//thenable
					result.then(function() {
						next();
					}, next);
				} else {
					//synced
					next(err);
				}
		}
	}, function(err) {
		asyncFinished = (err)
			? done
			: true;
		if (err || !waiting.length) {
			done(err);
		}
	});
}

function iterateSyncMiddleware(context, middleware, args) {
	middleware.forEach(function(callback) {
		callback.apply(context, args);
	});
}

/**
 *
 * @param hookObj
 * @returns {*}
 * @private
 */
function qualifyHook(hookObj) {
	if (!hookObj.name || !hookObj.type) {
		throw new Error('Only qualified hooks are allowed, e.g. "pre:save", not "save"');
	}
	return hookObj;
}

function createHooks(instance, config, flexible) {
	_.forEach(config, function(fn, hook) {
		const hookObj = parseHook(hook);
		instance[hookObj.name] = function() {
			const args = _.toArray(arguments);
			const ctx = instance.__grappling.opts.attachToPrototype ? this : instance;
			let done = null;

			if(!flexible) {
				done = args.pop();
				if (!_.isFunction(done)) {
					throw new Error('Async methods should receive a callback as a final parameter');
				}
			}
			else {
				if(args.length && _.isFunction(args[args.length - 1])) {
					done = args.pop();
				}
				else {
					done = _.noop;
				}
			}

 			doAsync(ctx, hookObj, fn, args, done);
		};
	});
}

function createSyncHooks(instance, config) {
	const q = instance.__grappling.opts.qualifiers;
	_.forEach(config, function(fn, hook) {
		const hookObj = parseHook(hook);
		instance[hookObj.name] = function() {
			const ctx = instance.__grappling.opts.attachToPrototype ? this : instance;
			const args = _.toArray(arguments);
			let middleware = instance.getMiddleware(q.pre + ':' + hookObj.name);
			let preArgs = instance.getMiddlewareArgs(q.pre + ':' + hookObj.name, args);
			let result;
			middleware.push(function() {
				result = fn.apply(ctx, preArgs);
			});
			middleware = middleware.concat(instance.getMiddleware(q.post + ':' + hookObj.name));
			let postArgs = instance.getMiddlewareArgs(q.post + ':' + hookObj.name, args);
 			iterateSyncMiddleware(ctx, middleware, postArgs);
			return result;
		};
	});
}

function createThenableHooks(instance, config) {
	_.forEach(config, function(fn, hook) {
		const hookObj = parseHook(hook);
		instance[hookObj.name] = function() {
			const args = _.toArray(arguments);
			const ctx = instance.__grappling.opts.attachToPrototype ? this : instance;
			return doTheanable(ctx, hookObj, fn, args);
		};
	});
}

function createDynamicHooks(instance, config) {
	_.each(config, function(fn, hook) {
		const hookObj = parseHook(hook);
		instance[hookObj.name] = function() {
			const args = _.toArray(arguments);
			const ctx = instance.__grappling.opts.attachToPrototype ? this : instance;
			let last = null;
			if(args.length && _.isFunction(args[args.length - 1])) {
				last = args.pop();
				doAsync(ctx, hookObj, fn, args, last);
			}
			else {
				return doTheanable(ctx, hookObj, fn, args);
			}
		};
	});
}

function doAsync(instance, hookObj, fn, args, done) {
	const q = instance.__grappling.opts.qualifiers;
	let results;
	dezalgofy(function(safeDone) {
		async.series([function(next) {
			let preArgs = instance.getMiddlewareArgs(q.pre + ':' + hookObj.name, args);
			iterateAsyncMiddleware(instance, instance.getMiddleware(q.pre + ':' + hookObj.name), preArgs, next);
		}, function(next) {
			fn.apply(instance, args.concat(function() {
				const args = _.toArray(arguments);
				const err = args.shift();
				results = args;
				next(err);
			}));
		}, function(next) {
			let postArgs = instance.getMiddlewareArgs(q.post + ':' + hookObj.name, args);
			iterateAsyncMiddleware(instance, instance.getMiddleware(q.post + ':' + hookObj.name), postArgs, next);
		}], function(err) {
			safeDone.apply(null, [err].concat(results));
		});
	}, done);
}

function doTheanable(instance, hookObj, fn, args) {
	const opts = instance.__grappling.opts;
	const q = instance.__grappling.opts.qualifiers;
	const deferred = {};
	const thenable = opts.createThenable(function(resolve, reject) {
		deferred.resolve = resolve;
		deferred.reject = reject;
	});
	async.series([function(next) {
		let preArgs = instance.getMiddlewareArgs(q.pre + ':' + hookObj.name, args);
		iterateAsyncMiddleware(instance, instance.getMiddleware(q.pre + ':' + hookObj.name), preArgs, next);
	}, function(next) {
		fn.apply(instance, args).then(function(result) {
			deferred.result = result;
			next();
		}, next);
	}, function(next) {
		let postArgs = instance.getMiddlewareArgs(q.post + ':' + hookObj.name, args);
		iterateAsyncMiddleware(instance, instance.getMiddleware(q.post + ':' + hookObj.name), postArgs, next);
	}], function(err) {
		if (err) {
			return deferred.reject(err);
		}
		return deferred.resolve(deferred.result);
	});

	return thenable;
}

function addHooks(instance, args) {
	const config = {};
	_.forEach(args, function(mixed) {
		if (_.isString(mixed)) {
			const hookObj = parseHook(mixed);
			const fn = instance[hookObj.name];
			if (!fn) throw new Error('Cannot add hooks to undeclared method:"' + hookObj.name + '"'); //non-existing method
			config[mixed] = fn;
		} else if (_.isObject(mixed)) {
			_.defaults(config, mixed);
		} else {
			throw new Error('`addHooks` expects (arrays of) Strings or Objects');
		}
	});
	instance.allowHooks(_.keys(config));
	return config;
}

function parseCallHookParams(instance, args) {
	return {
		context: (_.isString(args[0]))
			? instance
			: args.shift(),
		hook   : args.shift(),
		args   : args
	};
}

/**
 * Grappling hook
 * @alias GrapplingHook
 * @mixin
 */
const methods = {

	/**
	 * Adds middleware to a qualified hook.
	 * Convenience method which allows you to add middleware dynamically more easily.
	 *
	 * @param {String} qualifiedHook - qualified hook e.g. `pre:save`
	 * @param {(...middleware|middleware[])} middleware - middleware to call
	 * @instance
	 * @public
	 * @example
	 * instance.hook('pre:save', function(next) {
	 *   console.log('before saving');
	 *   next();
	 * }
	 * @returns {GrapplingHook|thenable}
	 */
	hook: function() {
		let fns = _.toArray(arguments);
		const hook = fns.shift();
		let output;
		qualifyHook(parseHook(hook));
		if (fns.length) {
			output = this;
		} else {
			output = this.__grappling.opts.createThenable(function(resolve) {
				fns = [resolve];
			});
		}
		addMiddleware(this, hook, fns);
		return output;
	},

	/**
	 * Removes {@link middleware} for `hook`
	 * @instance
	 * @example
	 * //removes `onPreSave` Function as a `pre:save` middleware
	 * instance.unhook('pre:save', onPreSave);
	 * @example
	 * //removes all middleware for `pre:save`
	 * instance.unhook('pre:save');
	 * @example
	 * //removes all middleware for `pre:save` and `post:save`
	 * instance.unhook('save');
	 * @example
	 * //removes ALL middleware
	 * instance.unhook();
	 * @param {String} [hook] - (qualified) hooks e.g. `pre:save` or `save`
	 * @param {(...middleware|middleware[])} [middleware] - function(s) to be removed
	 * @returns {GrapplingHook}
	 */
	unhook: function() {
		const fns = _.toArray(arguments);
		const hook = fns.shift();
		const hookObj = parseHook(hook);
		const middleware = this.__grappling.middleware;
		const q = this.__grappling.opts.qualifiers;
		if (hookObj.type || fns.length) {
			qualifyHook(hookObj);
			if (middleware[hook]) {
				middleware[hook] = (fns.length)
					? _.without.apply(null, [middleware[hook]].concat(fns))
					: [];
			}
		} else if (hookObj.name) {
			/* istanbul ignore else: nothing _should_ happen */
			if (middleware[q.pre + ':' + hookObj.name]) middleware[q.pre + ':' + hookObj.name] = [];
			/* istanbul ignore else: nothing _should_ happen */
			if (middleware[q.post + ':' + hookObj.name]) middleware[q.post + ':' + hookObj.name] = [];
		} else {
			_.forEach(middleware, function(callbacks, hook) {
				middleware[hook] = [];
			});
		}
		return this;
	},

	/**
	 * Determines whether registration of middleware to `qualifiedHook` is allowed. (Always returns `true` for lenient instances)
	 * @instance
	 * @param {String|String[]} qualifiedHook - qualified hook e.g. `pre:save`
	 * @returns {boolean}
	 */
	hookable: function(qualifiedHook) { //eslint-disable-line no-unused-vars
		if (!this.__grappling.opts.strict) {
			return true;
		}
		const args = _.flatten(_.toArray(arguments));
		return _.every(args, (qualifiedHook) => {
			qualifyHook(parseHook(qualifiedHook));
			return !!this.__grappling.middleware[qualifiedHook];
		});
	},

	/**
	 * Explicitly declare hooks
	 * @instance
	 * @param {(...string|string[])} hooks - (qualified) hooks e.g. `pre:save` or `save`
	 * @returns {GrapplingHook}
	 */
	allowHooks: function() {
		const args = _.flatten(_.toArray(arguments));
		const q = this.__grappling.opts.qualifiers;
		_.forEach(args, (hook) => {
			if (!_.isString(hook)) {
				throw new Error('`allowHooks` expects (arrays of) Strings');
			}
			const hookObj = parseHook(hook);
			const middleware = this.__grappling.middleware;
			if (hookObj.type) {
				if (hookObj.type !== q.pre && hookObj.type !== q.post) {
					throw new Error('Only "' + q.pre + '" and "' + q.post + '" types are allowed, not "' + hookObj.type + '"');
				}
				middleware[hook] = middleware[hook] || [];
			} else {
				middleware[q.pre + ':' + hookObj.name] = middleware[q.pre + ':' + hookObj.name] || [];
				middleware[q.post + ':' + hookObj.name] = middleware[q.post + ':' + hookObj.name] || [];
			}
		});
		return this;
	},

	/**
	 * Wraps asynchronous methods/functions with `pre` and/or `post` hooks
	 * @instance
	 * @see {@link GrapplingHook#addSyncHooks} for wrapping synchronous methods
	 * @see {@link GrapplingHook#addThenableHooks} for wrapping thenable methods
	 * @example
	 * //wrap existing methods
	 * instance.addHooks('save', 'pre:remove');
	 * @example
	 * //add method and wrap it
	 * instance.addHooks({
	 *   save: instance._upload,
	 *   "pre:remove": function(){
	 *   	//...
	 *   }
	 * });
	 * @param {(...String|String[]|...Object|Object[])} methods - method(s) that need(s) to emit `pre` and `post` events
	 * @returns {GrapplingHook}
	 */
	addHooks: function() {
		const config = addHooks(this, _.flatten(_.toArray(arguments)));
		createHooks(this, config);
		return this;
	},

	addFlexibleHooks: function() {
 		var config = addHooks(this, _.flatten(_.toArray(arguments)));
 		createHooks(this, config, true);
 		return this;
 	},

	/**
	 * Wraps synchronous methods/functions with `pre` and/or `post` hooks
	 * @since 2.4.0
	 * @instance
	 * @see {@link GrapplingHook#addHooks} for wrapping asynchronous methods
	 * @see {@link GrapplingHook#addThenableHooks} for wrapping thenable methods
	 * @param {(...String|String[]|...Object|Object[])} methods - method(s) that need(s) to emit `pre` and `post` events
	 * @returns {GrapplingHook}
	 */
	addSyncHooks: function() {
		const config = addHooks(this, _.flatten(_.toArray(arguments)));
		createSyncHooks(this, config);
		return this;
	},

	/**
	 * Wraps thenable methods/functions with `pre` and/or `post` hooks
	 * @since 3.0.0
	 * @instance
	 * @see {@link GrapplingHook#addHooks} for wrapping asynchronous methods
	 * @see {@link GrapplingHook#addSyncHooks} for wrapping synchronous methods
	 * @param {(...String|String[]|...Object|Object[])} methods - method(s) that need(s) to emit `pre` and `post` events
	 * @returns {GrapplingHook}
	 */
	addThenableHooks: function() {
		const config = addHooks(this, _.flatten(_.toArray(arguments)));
		createThenableHooks(this, config);
		return this;
	},

	addDynamicHooks: function() {
		const config = addHooks(this, _.flatten(_.toArray(arguments)));
		createDynamicHooks(this, config);
		return this;
	},

	/**
	 * Calls all middleware subscribed to the asynchronous `qualifiedHook` and passes remaining parameters to them
	 * @instance
	 * @see {@link GrapplingHook#callSyncHook} for calling synchronous hooks
	 * @see {@link GrapplingHook#callThenableHook} for calling thenable hooks
	 * @param {*} [context] - the context in which the middleware will be called
	 * @param {String} qualifiedHook - qualified hook e.g. `pre:save`
	 * @param {...*} [parameters] - any parameters you wish to pass to the middleware.
	 * @param {Function} [callback] - will be called when all middleware have finished
	 * @returns {GrapplingHook}
	 */
	callHook: function() {
		//todo: decide whether we should enforce passing a callback
		let i = arguments.length;
		const args = [];
		while (i--) {
			args[i] = arguments[i];
		}
		const params = parseCallHookParams(this, args);
		params.done = (_.isFunction(params.args[params.args.length - 1]))
			? params.args.pop()
			: null;

		let hookArgs = this.getMiddlewareArgs(params.hook, params.args);
		if (params.done) {
			dezalgofy((safeDone) => {
				iterateAsyncMiddleware(params.context, this.getMiddleware(params.hook), hookArgs, safeDone);
			}, params.done);
		} else {
			iterateAsyncMiddleware(params.context, this.getMiddleware(params.hook), hookArgs);
		}
		return this;
	},

	/**
	 * Calls all middleware subscribed to the synchronous `qualifiedHook` and passes remaining parameters to them
	 * @since 2.4.0
	 * @instance
	 * @see {@link GrapplingHook#callHook} for calling asynchronous hooks
	 * @see {@link GrapplingHook#callThenableHook} for calling thenable hooks
	 * @param {*} [context] - the context in which the middleware will be called
	 * @param {String} qualifiedHook - qualified hook e.g. `pre:save`
	 * @param {...*} [parameters] - any parameters you wish to pass to the middleware.
	 * @returns {GrapplingHook}
	 */
	callSyncHook: function() {
		let i = arguments.length;
		const args = [];
		while (i--) {
			args[i] = arguments[i];
		}
		const params = parseCallHookParams(this, args);
		const hookArgs = this.getMiddlewareArgs(params.hook, params.args);
		iterateSyncMiddleware(params.context, this.getMiddleware(params.hook), hookArgs);
		return this;
	},

	/**
	 * Calls all middleware subscribed to the synchronous `qualifiedHook` and passes remaining parameters to them
	 * @since 3.0.0
	 * @instance
	 * @see {@link GrapplingHook#callHook} for calling asynchronous hooks
	 * @see {@link GrapplingHook#callSyncHook} for calling synchronous hooks
	 * @param {*} [context] - the context in which the middleware will be called
	 * @param {String} qualifiedHook - qualified hook e.g. `pre:save`
	 * @param {...*} [parameters] - any parameters you wish to pass to the middleware.
	 * @returns {thenable} - a thenable, as created with {@link options}.createThenable
	 */
	callThenableHook: function() {
		const params = parseCallHookParams(this, _.toArray(arguments));
		const deferred = {};
		const thenable = this.__grappling.opts.createThenable(function(resolve, reject) {
			deferred.resolve = resolve;
			deferred.reject = reject;
		});
		dezalgofy((safeDone) => {
			const hookArgs = this.getMiddlewareArgs(params.hook, params.args);
			iterateAsyncMiddleware(params.context, this.getMiddleware(params.hook), hookArgs, safeDone);
		}, function(err) {
			if (err) {
				return deferred.reject(err);
			}
			return deferred.resolve();
		});
		return thenable;
	},

	/**
	 * Retrieve all {@link middleware} registered to `qualifiedHook`
	 * @instance
	 * @param qualifiedHook - qualified hook, e.g. `pre:save`
	 * @returns {middleware[]}
	 */
	getMiddleware: function(qualifiedHook) {
		qualifyHook(parseHook(qualifiedHook));
		const middleware = this.__grappling.middleware[qualifiedHook];
		if (middleware) {
			return middleware.slice(0);
		}
		return [];
	},

	/**
	 * Determines whether any {@link middleware} is registered to `qualifiedHook`.
	 * @instance
	 * @param {string} qualifiedHook - qualified hook, e.g. `pre:save`
	 * @returns {boolean}
	 */
	hasMiddleware: function(qualifiedHook) {
		return this.getMiddleware(qualifiedHook).length > 0;
	},

	getMiddlewareArgs: function(qualifiedHook, args) {
		const mwOpts = this.__grappling.mwopts[qualifiedHook];
		if(!mwOpts) {
			return args;
		}
		if(mwOpts.passParams === true) {
			return args;
		}
		else if(!mwOpts.passParams) {
 			return [];
 		}
		else if(_.isNumber(mwOpts.passParams)) {
			return _.slice(args, 9, mwOpts.passParams);
		}
		else if(Array.isArray(mwOpts.passParams)) {
			return _.map(args, function(n) {
				return _.nth(args, n);
			});
		}
		return args;
	}
};

/**
 * alias for {@link GrapplingHook#addHooks}.
 * @since 3.0.0
 * @name GrapplingHook#addAsyncHooks
 * @instance
 * @method
 */
methods.addAsyncHooks = methods.addHooks;
/**
 * alias for {@link GrapplingHook#callHook}.
 * @since 3.0.0
 * @name GrapplingHook#callAsyncHook
 * @instance
 * @method
 */
methods.callAsyncHook = methods.callHook;

/**
 * @module grappling-hook
 * @type {exports|module.exports}
 */
module.exports = {
	/**
	 * Mixes {@link GrapplingHook} methods into `instance`.
	 * @see {@link module:grappling-hook.attach attach} for attaching {@link GrapplingHook} methods to prototypes.
	 * @see {@link module:grappling-hook.create create} for creating {@link GrapplingHook} instances.
	 * @param {Object} instance
	 * @param {string} [presets] - presets name, see {@link module:grappling-hook.set set}
	 * @param {options} [opts] - {@link options}.
	 * @mixes GrapplingHook
	 * @returns {GrapplingHook}
	 * @example
	 * var grappling = require('grappling-hook');
	 * var instance = {
	 * };
	 * grappling.mixin(instance); // add grappling-hook functionality to an existing object
	 */
	mixin: function mixin(instance, presets, opts) {//eslint-disable-line no-unused-vars
		const args = new Array(arguments.length);
		for (let i = 0; i < args.length; ++i) {
			args[i] = arguments[i];
		}
		instance = args.shift();
		init.apply(instance, args);
		_.assignIn(instance, methods);
		return instance;
	},

	/**
	 * Creates an object with {@link GrapplingHook} functionality.
	 * @see {@link module:grappling-hook.attach attach} for attaching {@link GrapplingHook} methods to prototypes.
	 * @see {@link module:grappling-hook.mixin mixin} for mixing {@link GrapplingHook} methods into instances.
	 * @param {string} [presets] - presets name, see {@link module:grappling-hook.set set}
	 * @param {options} [opts] - {@link options}.
	 * @returns {GrapplingHook}
	 * @example
	 * var grappling = require('grappling-hook');
	 * var instance = grappling.create(); // create an instance
	 */
	create: function create(presets, opts) {//eslint-disable-line no-unused-vars
		const args = new Array(arguments.length);
		for (let i = 0; i < args.length; ++i) {
			args[i] = arguments[i];
		}
		const instance = {};
		init.apply(instance, args);
		_.assignIn(instance, methods);
		return instance;
	},

	/**
	 * Attaches {@link GrapplingHook} methods to `base`'s `prototype`.
	 * @see {@link module:grappling-hook.create create} for creating {@link GrapplingHook} instances.
	 * @see {@link module:grappling-hook.mixin mixin} for mixing {@link GrapplingHook} methods into instances.
	 * @param {Function} base
	 * @param {string} [presets] - presets name, see {@link module:grappling-hook.set set}
	 * @param {options} [opts] - {@link options}.
	 * @mixes GrapplingHook
	 * @returns {Function}
	 * @example
	 * var grappling = require('grappling-hook');
	 * var MyClass = function() {
	 * };
	 * MyClass.prototype.save = function(done) {
	 *   console.log('save!');
	 *   done();
	 * };
	 * grappling.attach(MyClass); // attach grappling-hook functionality to a 'class'
	 */
	attach: function attach(base, presets, opts) {//eslint-disable-line no-unused-vars
		if(!opts && _.isObject(presets)) {
			opts = presets;
			presets = undefined;
		}
		const options = _.defaults({}, opts, {
			attachToPrototype: false
		});
		const proto = (base.prototype)
			? base.prototype
			: base;
		_.forEach(methods, function(fn, methodName) {
			proto[methodName] = function() {
				init.call(this, presets, options);
				_.forEach(methods, (fn, methodName) => {
					this[methodName] = fn.bind(this);
				});
				return fn.apply(this, arguments);
			};
		});
		return base;
	},

	/**
	 * Store `presets` as `name`. Or set a specific value of a preset.
	 * (The use of namespaces is to avoid the very unlikely case of name conflicts with deduped node_modules)
	 * @since 3.0.0
	 * @see {@link module:grappling-hook.get get} for retrieving presets
	 * @param {string} name
	 * @param {options} options
	 * @returns {module:grappling-hook}
	 * @example
	 * //index.js - declaration
	 * var grappling = require('grappling-hook');
	 * grappling.set('grapplinghook:example', {
	 *   strict: false,
	 *   qualifiers: {
	 *     pre: 'before',
	 *     post: 'after'
	 *   }
	 * });
	 *
	 * //foo.js - usage
	 * var instance = grappling.create('grapplinghook:example'); // uses options as cached for 'grapplinghook:example'
	 * @example
	 * grappling.set('grapplinghook:example.qualifiers.pre', 'first');
	 * grappling.set('grapplinghook:example.qualifiers.post', 'last');
	 */
	set: function(name, options) {
		_.set(presets, name, options);
		return module.exports;
	},

	/**
	 * Retrieves presets stored as `name`. Or a specific value of a preset.
	 * (The use of namespaces is to avoid the very unlikely case of name conflicts with deduped node_modules)
	 * @since 3.0.0
	 * @see {@link module:grappling-hook.set set} for storing presets
	 * @param {string} name
	 * @returns {*}
	 * @example
	 * grappling.get('grapplinghook:example.qualifiers.pre');
	 * @example
	 * grappling.get('grapplinghook:example.qualifiers');
	 * @example
	 * grappling.get('grapplinghook:example');
	 */
	get: function(name) {
		return _.get(presets, name);
	},

	/**
	 * Determines whether `subject` is a {@link thenable}.
	 * @param {*} subject
	 * @returns {Boolean}
	 * @see {@link thenable}
	 */
	isThenable: function isThenable(subject) {
		return subject && subject.then && _.isFunction(subject.then);
	}
};
