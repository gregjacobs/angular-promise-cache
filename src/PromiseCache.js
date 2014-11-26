angular.module( 'angular-promise-cache', [] ).factory( 'PromiseCache', [ 'PromiseCache.CacheEntry', 'PromiseCache.LruList', function( CacheEntry, LruList ) {
	
	/**
	 * @class PromiseCache
	 * 
	 * A cache which has knowledge of Angular promises, used to optimize applications by removing expensive
	 * asynchronous processing (such as network requests) for the same data.
	 * 
	 * For example, in the context of network requests:
	 * 
	 * 1) A call may be made to retrieve the data for User #1. This triggers a network request.
	 * 2) While that request is in progress, another part of the application may also call for the data of User #1.
	 * 3) Instead of a 2nd network request being made, the 2nd call is "joined" to the first network request (the 1st 
	 *    request's Promise is returned to the 2nd caller), and both parts of the application receive their data when 
	 *    the single network request for User #1 completes.
	 *    
	 * This implementation is used as opposed to caching just the server-received data. Since the data itself can only
	 * be cached once it has been returned, this implementation optimizes network requests by caching the Promise itself,
	 * making sure only one network request has been made.
	 * 
	 * Note that network requests are just an example and are not the only application for this cache. Any asynchronous 
	 * promise-based operation may be cached.
	 * 
	 * 
	 * ## Options
	 * 
	 * The cache may be configured with a few options:
	 * 
	 * - {@link #factory}: The factory function used to create the cache entries when they do not yet exist in the cache.
	 *   This may alternatively be provided as the second argument passed to {@link #get}.
	 * - {@link #context}: The context object (`this` reference) to run the {@link #factory} function in. Useful for OOP
	 *   implementations.
	 * - {@link #maxSize}: The maximum number of entries to allow in the cache. Entries are removed on a LRU (least
	 *   recently used) basis when the size has been exceeded.
	 * - {@link #maxAge}: A number, in milliseconds, to allow cache entries to exist for. After this time has elapsed,
	 *   cache entries are considered stale and will not be returned. These entries will also be automatically removed
	 *   when the {@link #prune} task executes.
	 * - {@link #pruneInterval}: How often the {@link #prune} task should execute to remove old entries.
	 * 
	 * 
	 * ## Promise Rejection
	 * 
	 * If a Promise is rejected, it is removed from the cache. This is to allow a new call for the data to re-request
	 * the original source data.
	 * 
	 * 
	 * ## Destroying the Cache
	 * 
	 * If the cache is no longer to be in use, the {@link #destroy} method must be executed to clear up references and 
	 * stop the {@link #maxAge} {@link #pruneInterval pruning} interval.
	 * 
	 * Most often, a PromiseCache will be used within a singleton service that lasts the lifetime of an app and therefore 
	 * will not need to be cleaned up, but there are cases for manually destroying a PromiseCache.
	 * 
	 * 
	 * ## Examples
	 * 
	 * ### Using Factory Function Passed to the Constructor to Generate Cache Entries
	 * 
	 * ```
	 * angular.module( 'myModule' ).factory( 'UserService', [ '$http', 'PromiseCache', function( $http, PromiseCache ) {
	 *     var userPromiseCache = new PromiseCache( {
	 *         factory : function( userId ) {
	 *             return $http.get( '/users/' + userId );
	 *         }
	 *     } );
	 *     
	 *     return {
	 *         loadUser : function( userId ) {
	 *             return userPromiseCache.get( userId, [ userId ] );  // 1st arg is the cache key
	 *                                                                 // 2nd arg is an array of the arguments to pass to the 
	 *                                                                 // `factory` function if the cache entry does not yet exist
	 *         }
	 *     };
	 * } ] );
	 * ```
	 * 
	 * 
	 * ### Using Inline Factory Function Passed to {@link #get} to Generate Cache Entries
	 * 
	 * ```
	 * angular.module( 'myModule' ).factory( 'UserService', [ '$http', 'PromiseCache', function( $http, PromiseCache ) {
	 *     var userPromiseCache = new PromiseCache();
	 *     
	 *     return {
	 *         loadUser : function( userId ) {
	 *             return userPromiseCache.get( userId, function() {  // function called to create the promise if `userId` does not yet exist in the cache
	 *                 return $http.get( '/users/' + userId );
	 *             } );
	 *         }
	 *     };
	 * } ] );
	 * ```
	 * 
	 * 
	 * ### Expiring Entries After 60 Seconds, with a Maximum Cache Size of 10 Entries
	 * 
	 * ```
	 * angular.module( 'myModule' ).factory( 'UserService', [ '$http', 'PromiseCache', function( $http, PromiseCache ) {
	 *     var userPromiseCache = new PromiseCache( {
	 *         factory : function( userId ) {
	 *             return $http.get( '/users/' + userId );
	 *         },
	 *         maxAge: 60 * 1000,  // 60 sec
	 *         maxSize: 10
	 *     } );
	 *     
	 *     return {
	 *         loadUser : function( userId ) {
	 *             return userPromiseCache.get( userId, [ userId ] );  // 1st arg is the cache key
	 *                                                                 // 2nd arg is an array of the arguments to pass to the 
	 *                                                                 // `factory` function if the cache entry does not yet exist
	 *         }
	 *     };
	 * } ] );
	 * ```
	 * 
	 * @constructor
	 * @param {Object} [cfg] Any of the configuration options for this class, specified in an Object (map).
	 */
	var PromiseCache = function( cfg ) {
		angular.extend( this, cfg );
	};
	
	
	angular.extend( PromiseCache.prototype, {
		
		/**
		 * @cfg {Function} factory
		 * 
		 * The factory function used to create the cache entries when they do not yet exist in the cache. This function 
		 * *must* return an Angular promise object, or an error will be thrown. See class description for examples.
		 * 
		 * If this config is not provided, a factory function must be passed as the second argument to {@link #get}.
		 */
		
		/**
		 * @cfg {Object} context
		 * 
		 * The context object to run the {@link #factory} function in. Defaults to the `window` object.
		 */
		context : null,
		
		/**
		 * @cfg {Number} maxSize
		 * 
		 * The maximum size for the cache. If this size is reached, entries will be removed on a LRU (least recently used)
		 * basis.
		 */
		maxSize : null,
		
		/**
		 * @cfg {Number} maxAge
		 * 
		 * A number, in milliseconds, of how long items may exist in the cache before being considered stale and removed.
		 * 
		 * Defaults to `null`, for no maxAge.
		 */
		maxAge : null,
		
		/**
		 * @cfg {Number} pruneInterval
		 * 
		 * A number, in milliseconds, of how often to prune the cache (i.e. remove expired entries). This only applies when
		 * a {@link #maxAge} has been specified.
		 * 
		 * Set to `null` for no automatic pruning. Old cache entries will remain, unless {@link #prune} is manually called.
		 */
		pruneInterval : 60 * 1000,  // 60 sec
		
		
		/**
		 * @private
		 * @property {Object} cache
		 * 
		 * The internal Object (map) of cache keys to {@link PromiseCache.CacheEntry CacheEntries}. This is lazily created
		 * when a promise is added to the cache.
		 */
		cache : null,
		
		/**
		 * @private
		 * @property {Number} size
		 * 
		 * Maintains the number of entries currently in the cache, including expired entires. Must retrieve with 
		 * {@link #getSize} for an accurate count of unexpired entries.
		 */
		size : 0,
		
		/**
		 * @private
		 * @property {Number} pruningIntervalId
		 * 
		 * The ID returned from `setInterval()`, which is used to remove the interval when the PromiseCache is either
		 * {@link #destroyed} or all entries have been removed from it.
		 */
		pruningIntervalId : null,
		
		/**
		 * @protected
		 * @property {PromiseCache.LruList} lruList
		 * 
		 * The LruList instance which maintains a doubly linked list to implement the LRU scheme.
		 */
		lruList : null,
		
		
		/**
		 * Retrieves a Promise from the cache by the given `key`, adding it to the cache if `key` does not yet exist.
		 * 
		 * If `key` does not exist in the cache, the Promise is created using the {@link #factory} function. The {@link #factory}
		 * function *must* return a Promise object, or an error will be thrown. 
		 * 
		 * See class description for more example usage.
		 * 
		 * @param {String} key The key retrieve from the cache. If the key does not yet exist, the {@link #factory} function
		 *   will be called, and its returned promise will be stored under this key.
		 * @param {Array/Function} factoryArgsOrFactoryFn An array of arguments to pass to the {@link #factory} function
		 *   that was configured with the constructor, or a custom factory function to create the promise in the cache
		 *   for this particular call to `get()`.
		 *   
		 *   If passing a custom factory function here, it follows the same rules as the constructor-configured {@link #factory} 
		 *   function in that it must return an Angular promise object. 
		 *   
		 *   Note: if no {@link #factory} was provided to the constructor, then a factory function is required here.
		 * @return {Q.Promise} The Promise object that was previously cached under `key`, or the newly-created Promise which
		 *   was generated from the {@link #factory}.
		 */
		get : function( key, factoryArgsOrFactoryFn ) {
			var factoryFn = this.resolveFactoryFn( factoryArgsOrFactoryFn );
			
			if( !this.cache ) this.cache = {};  // lazily instantiate the cache map
			if( !this.lruList && this.maxSize !== null ) this.lruList = new LruList();
			
			var cacheEntry = this.cache[ key ],
			    promise;
			
			if( cacheEntry && !cacheEntry.isExpired( this.maxAge ) ) {
				promise = cacheEntry.getPromise();
				if( this.lruList ) this.lruList.touch( cacheEntry );
			} else {
				promise = this.addEntry( key, factoryFn );  // not yet in the cache (or the cached entry is expired), add the new entry
			}
			
			return promise;
		},
		
		
		/**
		 * Resolves the factory function based on the 2nd argument passed to {@link #get} (`factoryArgsOrFactoryFn`).
		 * 
		 * - If a factory function was passed directly to {@link #get}, this function will be returned.
		 * - If a factory function was not passed to {@link #get}, then it will default to the {@link factory} config
		 *   passed to the constructor. In this case, an optional array of arguments may have been passed, in which
		 *   a function with these arguments partially applied is returned. The {@link #factory} function will also be
		 *   called with {@link #context} as its context object.
		 *   
		 * If the factory function could not be resolved (due to it not being passed directly, and no {@link #factory}
		 * being configured on the constructor), then an error will be thrown.
		 *   
		 * @private
		 * @param {Array/Function} factoryArgsOrFactoryFn The `factoryArgsOrFactoryFn` argument passed to {@link #get}.
		 * @return {Function} The factory function.
		 */
		resolveFactoryFn : function( factoryArgsOrFactoryFn ) {
			if( typeof factoryArgsOrFactoryFn === 'function' ) {
				return factoryArgsOrFactoryFn;
				
			} else {
				if( !this.factory ) throw new Error( '`factory` function required as 2nd arg to get(), since no `factory` provided to PromiseCache constructor' );
				
				var factoryArgs = factoryArgsOrFactoryFn;  // for clarity
				return angular.bind.apply( angular, [ this.context, this.factory ].concat( factoryArgs || [] ) );
			}
		},
		
		
		/**
		 * Utility method to add a cache entry, which is called from {@link #get} when there is a cache miss, and a
		 * promise is to be set into the cache.
		 * 
		 * @private
		 * @param {String} key The key store the promise under.
		 * @param {Function} factoryFn The function to execute to create the Promise in the cache.
		 * @return {Q.promise} The promise returned from the `factoryFn` function.
		 */
		addEntry : function( key, factoryFn ) {
			var me = this,  // for closure
			    promise = factoryFn(),
			    cacheEntry;
			
			if( promise && typeof promise.then === 'function' ) {  // a little duck typing to determine if the object returned from `factoryFn()` is a promise
				cacheEntry = this.cache[ key ] = new CacheEntry( key, promise );
				if( this.lruList ) this.lruList.pushMru( cacheEntry );
				this.size++;
				
				this.startPruningInterval();  // starts the pruning interval if it's not already running
				
				// If the addition exceeds the maxSize, removed the least recently used entry
				if( this.maxSize !== null && this.size > this.maxSize ) {
					this.removeEntry( this.lruList.getLru() );
				}
			} else {
				throw new Error( '`factory` function must return a Promise object' );
			}
			
			// If the deferred is rejected, remove it from the cache so that subsequent "get()'s" 
			// trigger a new request to the `factoryFn`
			promise.then( null, angular.bind( this, this.removeIfEntry, key, cacheEntry ) );  // use bind() to not create a closure to the variables in this method
			
			return promise;
		},
		
		
		/**
		 * Retrieves the number of entries currently in the cache. This is usually used for testing/debugging purposes.
		 * 
		 * Note: cache entries will be {@link #prune pruned} before returning the value from this method in the case 
		 * that {@link #maxAge} is in use. This is so that expired entries are not included as part of the count.
		 * 
		 * @return {Number} The number of entries that are currently in the cache.
		 */
		getSize : function() {
			this.prune();  // we must remove expired entries in order to retrieve an accurate count
			
			return this.size;
		},
		
		
		/**
		 * Convenience method (mainly used for testing/debugging) to determine if there is an entry in the cache, and it is
		 * not yet expired.
		 * 
		 * @param {String} key The key to check for in the cache.
		 * @return {Boolean} `true` if there is an entry in the cache under `key`, and that entry is not yet expired.
		 */
		has: function( key ) {
			if( !this.cache ) return false;
			
			var cacheEntry = this.cache[ key ];
			return ( !!cacheEntry && !cacheEntry.isExpired( this.maxAge ) );
		},
		
		
		/**
		 * Removes a cache entry by `key`.
		 * 
		 * @param {String} key The key to remove from the cache.
		 */
		remove : function( key ) {
			var cache = this.cache;
			if( !cache ) return false;
			
			var cacheEntry = cache[ key ];
			if( cacheEntry ) {
				this.removeEntry( cacheEntry );
			}
		},
		
		
		/**
		 * Removes the given `cacheEntry`.
		 * 
		 * @private
		 * @param {PromiseCache.CacheEntry} cacheEntry
		 */
		removeEntry : function( cacheEntry ) {
			if( this.size === 1 ) {  // removing the last entry, simply clear out the cache (set to `null`), and stop the pruning interval
				this.clear();
				
			} else {
				this.size--;
				if( this.lruList ) this.lruList.remove( cacheEntry );
				delete this.cache[ cacheEntry.getKey() ];
			}
		},
		
		
		/**
		 * Removes the cache entry at `key`, but only if the `cacheEntry` is the {@link PromiseCache.CacheEntry CacheEntry}
		 * instance provided.
		 * 
		 * This is used internally to remove cache entries when a promise's deferred is rejected. We don't want
		 * to accidentally remove an overwritten cache entry when an previous deferred stored under the same 
		 * `key` is rejected.
		 * 
		 * @private
		 * @param {String} key The key to remove from the cache.
		 * @param {PromiseCache.CacheEntry} cacheEntry The CacheEntry object that must exist under the `key` in order
		 *   for the `key` to be removed from the cache.
		 */
		removeIfEntry : function( key, cacheEntry ) {
			var cache = this.cache;
			if( !cache ) return;
			
			if( cache[ key ] === cacheEntry ) {
				this.removeEntry( cacheEntry );
			}
		},
		
		
		/**
		 * Clears the cache of all entries.
		 */
		clear : function() {
			this.cache = this.lruList = null;
			this.size = 0;
			
			this.stopPruningInterval();
		},
		
		
		// -----------------------------------
		
		// Pruning Functionality
		
		/**
		 * Prunes the cache, removing expired entries (based on {@link #maxAge}).
		 * 
		 * Normally, you do not need to call this as it will be done on an interval (see {@link #pruneInterval}). However,
		 * it may be desirable to call it at certain points in time, especially if the {@link #pruneInterval} is set to
		 * a long time.
		 */
		prune : function() {
			var cache = this.cache,
			    maxAge = this.maxAge;
			
			if( !cache ) return;
			if( maxAge == null ) return;  // no need to loop through the cache when there is no `maxAge` in use. In this case, entries can't expire.
			
			var cacheEntry;
			for( var key in cache ) {
				if( cache.hasOwnProperty( key ) && ( cacheEntry = cache[ key ] ).isExpired( maxAge ) ) {
					this.removeEntry( cacheEntry );
				}
			}
		},
		
		
		/**
		 * Starts the pruning interval, which runs every {@link #pruneInterval} milliseconds to remove old (i.e. expired)
		 * entries from the cache.
		 * 
		 * The interval is only active when there are entries in the cache, and there is actually a {@link #maxAge} set (meaning
		 * that entries may expire).
		 * 
		 * @private
		 */
		startPruningInterval : function() {
			// If already running the pruning interval, do nothing
			if( this.pruningIntervalId ) return;
			
			var pruneInterval = this.pruneInterval;
			if( pruneInterval == null ) return;  // don't set up the prune interval if the user doesn't want one
			if( this.maxAge == null ) return;    // no need for pruning if entries don't expire
			
			var prune = angular.bind( this, this.prune );
			this.pruningIntervalId = setInterval( prune, pruneInterval );  // note: not using $interval here since there is no reason to run a $digest() when expired entries are removed from the cache
		},
		
		
		/**
		 * Stops the prune interval started in {@link #startPruningInterval}.
		 * 
		 * @private
		 */
		stopPruningInterval : function() {
			if( this.pruningIntervalId ) {
				clearInterval( this.pruningIntervalId );
				
				this.pruningIntervalId = null;
			}
		},
		
		
		// -----------------------------------
		
		
		/**
		 * Destroys the PromiseCache by removing the cache references, and removing the prune interval.
		 */
		destroy : function() {
			this.clear();  // note: also stops the pruning interval
		}
		
	} );
	
	
	return PromiseCache;

} ] );