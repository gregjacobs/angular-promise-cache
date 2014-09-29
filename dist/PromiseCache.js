/*!
 * angular-promise-cache
 * 0.1.0
 *
 * Copyright(c) 2014 Gregory Jacobs <greg@greg-jacobs.com>
 * MIT
 *
 * https://github.com/gregjacobs/angular-promise-cache
 */
angular.module( 'angular-promise-cache', [] ).factory( 'PromiseCache', function() {
	
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
	 *    the lone network request for User #1 completes.
	 *    
	 * This implementation is used as opposed to caching just the server-received data. Since the data itself can only
	 * be cached once it has been returned, this implementation optimizes network requests by caching the Promise itself,
	 * making sure only one network request has been made.
	 * 
	 * ## Promise Rejection
	 * 
	 * If a Promise is rejected, it is removed from the cache. This is to allow a new call for the data to re-request
	 * the original source data.
	 * 
	 * ## Example
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
	 * @constructor
	 * @param {Object} [cfg] Any of the configuration options for this class, specified in an Object (map).
	 */
	function PromiseCache( cfg ) {
		angular.extend( this, cfg );
		
		this.cache = null;  // will lazily instantiate it when an entry is added
		this.size = 0;
	}
	
	
	PromiseCache.prototype = {
		constructor : PromiseCache,
		
		
		/**
		 * @cfg {Number} maxAge
		 * 
		 * A number, in milliseconds, of how long items may exist in the cache before being considered stale and removed.
		 * 
		 * Defaults to `null`, for no maxAge.
		 */
		maxAge : null,
		
		
		/**
		 * Retrieves a Promise from the cache by the given `key`, adding it to the cache if `key` does not yet exist.
		 * 
		 * If `key` does not exist in the cache, the Promise is created using the `setter` function. The `setter`
		 * function *must* return a Promise object, or an error will be thrown. 
		 * 
		 * See class description for more details on usage.
		 * 
		 * @param {String} key The key retrieve from the cache. If the key does not yet exist, the `setter` function
		 *   will be called, and stored under this key.
		 * @param {Function} setter The function to create the Promise in the cache.
		 * @return {Q.Promise}
		 */
		get : function( key, setter ) {
			if( typeof setter !== 'function' ) {
				throw new Error( '`setter` arg required, and must be a function' );
			}
			
			if( !this.cache ) this.cache = {};  // lazily instantiate the cache map
			
			var cacheEntry = this.cache[ key ],
			    promise;
			
			if( cacheEntry && !this.isExpired( cacheEntry ) ) {
				promise = cacheEntry.getPromise();
			} else {
				promise = this.addEntry( key, setter );  // not yet in the cache (or the cached entry is expired), add the new entry
			}
			
			return promise;
		},
		
		
		/**
		 * Utility method to add a cache entry.
		 * 
		 * @private
		 * @param {String} key The key store the promise under.
		 * @param {Function} setter The function to create the Promise in the cache.
		 * @return {Q.promise} The promise returned from the `setter` function.
		 */
		addEntry : function( key, setter ) {
			var me = this,  // for closure
			    promise = setter(),
			    cacheEntry;
			
			if( promise && typeof promise.then === 'function' ) {  // a little duck typing to determine if the object returned from `setter()` is a promise
				cacheEntry = this.cache[ key ] = new CacheEntry( promise );
				this.size++;
			} else {
				throw new Error( '`setter` function must return a Promise object' );
			}
			
			// If the deferred is rejected, remove it from the cache so that subsequent "get()'s" 
			// trigger a new request to the `setter`
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
			this.prune();
			
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
			return ( !!cacheEntry && !this.isExpired( cacheEntry ) );
		},
		
		
		/**
		 * Removes a cache entry by `key`.
		 * 
		 * @param {String} key The key to remove from the cache.
		 */
		remove : function( key ) {
			var cache = this.cache;
			if( !cache ) return false;
			
			if( cache[ key ] ) {
				if( this.size === 1 ) {  // removing the last entry, simply clear out the cache (set to `null`)
					this.clear();
					
				} else {
					delete cache[ key ];
					this.size--;
				}
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
				this.remove( key );
			}
		},
		
		
		/**
		 * Determines if a cache entry is expired, based on the `cacheEntry`'s insertion time, and the {@link #maxAge} config.
		 * 
		 * @private
		 * @param {PromiseCache.CacheEntry} cacheEntry
		 * @return {Boolean} `true` if the cache entry is expired, `false` otherwise.
		 */
		isExpired : function( cacheEntry ) {
			var maxAge = this.maxAge;
			if( maxAge == null ) return false;  // no `maxAge` in use, then the cacheEntry can't be expired
			
			var now = (new Date()).getTime();
			return ( now > cacheEntry.getEntryTime() + maxAge );
		},
		
		
		/**
		 * Clears the cache of all entries.
		 */
		clear : function() {
			this.cache = null;
			this.size = 0;
		},
		
		
		// -----------------------------------
		
		// Pruning Functionality
		
		/**
		 * Prunes the cache, removing expired entries (based on {@link #maxAge}).
		 */
		prune : function() {
			var cache = this.cache;
			
			if( !cache ) return;
			if( this.maxAge == null ) return;  // no need to loop through the cache when there is no `maxAge` in use. In this case, entries can't expire.
			
			for( var key in cache ) {
				if( cache.hasOwnProperty( key ) && this.isExpired( cache[ key ] ) ) {
					this.remove( key );
				}
			}
		}
		
	};
	
	
	/**
	 * @private
	 * @class PromiseCache.CacheEntry
	 * 
	 * Represents an entry in the cache.
	 * 
	 * @constructor
	 * @param {Q.promise} promise The promise that the cache entry is to hold.
	 */
	function CacheEntry( promise ) {
		this.promise = promise;
		this.entryTime = (new Date()).getTime();
	}
	
	
	CacheEntry.prototype = {
		constructor : CacheEntry,
		
		/**
		 * Returns the promise object for this CacheEntry.
		 * 
		 * @return {Q.promise}
		 */
		getPromise : function() {
			return this.promise;
		},
		
		
		/**
		 * Returns the time that the cache entry was added, in milliseconds from the unix epoch.
		 * 
		 * @return {Number}
		 */
		getEntryTime : function() {
			return this.entryTime;
		}
		
	};
	
	
	return PromiseCache;

} );