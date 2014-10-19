angular.module( 'angular-promise-cache' ).factory( 'PromiseCache.CacheEntry', function() {
	
	/**
	 * @protected
	 * @class PromiseCache.CacheEntry
	 * 
	 * Represents an entry in the cache.
	 * 
	 * @constructor
	 * @param {String} key The key that the CacheEntry is stored under.
	 * @param {Q.Promise} promise The promise that the cache entry is to hold.
	 */
	var CacheEntry = function( key, promise ) {
		this.key = key;
		this.promise = promise;
		this.entryTime = (new Date()).getTime();
		
		this.next = null;
		this.prev = null;
	};
	
	
	angular.extend( CacheEntry.prototype, {
		
		/**
		 * @private
		 * @property {String} key
		 * 
		 * The key that the CacheEntry is stored under.
		 */
		
		/**
		 * @private
		 * @property {Q.Promise} promise
		 * 
		 * The Promise that is stored in this cache entry.
		 */
		
		/**
		 * @private
		 * @property {Number} entryTime
		 * 
		 * The time that this entry was added to the cache as the number of milliseconds since 1/1/1970.
		 */
		
		/**
		 * @private
		 * @property {PromiseCache.CacheEntry} next
		 * 
		 * The next entry in the doubly-linked list that CacheEntries form in order to implement the LRU functionality.
		 */
		
		/**
		 * @private
		 * @property {PromiseCache.CacheEntry} prev
		 * 
		 * The previous entry in the doubly-linked list that CacheEntries form in order to implement the LRU 
		 * functionality.
		 */
		
		
		/**
		 * Returns the {@link #key} for this CacheEntry.
		 * 
		 * @return {String}
		 */
		getKey : function() {
			return this.key;
		},
		
		
		/**
		 * Returns the {@link #promise} object for this CacheEntry.
		 * 
		 * @return {Q.Promise}
		 */
		getPromise : function() {
			return this.promise;
		},
		
		
		/**
		 * Determines if the CacheEntry has expired, based on the current time, and the `maxAge` given.
		 * 
		 * @param {Number} maxAge The maximum age for the CacheEntry to live, in milliseconds. If `null` is
		 *   passed in (for "no max age"), the method returns false.
		 * @return {Boolean} `true` if the CacheEntry has expired, `false` otherwise.
		 */
		isExpired : function( maxAge ) {
			if( maxAge === null ) return false;
			
			var now = (new Date()).getTime();
			return ( now > this.entryTime + maxAge );
		}
		
	} );
	
	
	return CacheEntry;
	
} );