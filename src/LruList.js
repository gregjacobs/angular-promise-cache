angular.module( 'angular-promise-cache' ).factory( 'PromiseCache.LruList', function() {
	
	/**
	 * @class PromiseCache.LruList
	 * 
	 * A doubly linked list implementation for maintaining a LRU cache.
	 * 
	 * The elements of this list are {@link PromiseCache.CacheEntry CacheEntries}, which
	 * hold pointers to their previous and next elements in the list.
	 */
	var LruList = function() {
		this.mru = null;
		this.lru = null;
	};
	
	
	angular.extend( LruList.prototype, {
		
		/**
		 * @private
		 * @property {PromiseCache.CacheEntry} mru
		 * 
		 * A reference to the most recently used cache entry. The cache entries form a doubly linked list, where the
		 * most recently used is the "head" of the list, and {@link PromiseCache.CacheEntry#next} pointers point to
		 * the next "least recently used" entry.
		 */
		
		/**
		 * @private
		 * @property {PromiseCache.CacheEntry} lru
		 * 
		 * A reference to the least recently used cache entry. The cache entries form a doubly linked list, where the
		 * most recently used is the "head" of the list, and {@link PromiseCache.CacheEntry#next} pointers point to
		 * the next "least recently used" entry.
		 */
		
		
		/**
		 * Pushes `cacheEntry` onto the LruList as the "most recently used" (MRU) entry.
		 * 
		 * @param {PromiseCache.CacheEntry} cacheEntry
		 */
		pushMru : function( cacheEntry ) {
			if( !this.lru ) {
				this.lru = this.mru = cacheEntry;
				
			} else {
				this.mru.next = cacheEntry;
				cacheEntry.prev = this.mru;
				this.mru = cacheEntry;
			}
		},
		
		
		/**
		 * "Touches" a cache entry, setting it to the "most recently used" (MRU) position.
		 * 
		 * @param {PromiseCache.CacheEntry} cacheEntry
		 */
		touch : function( cacheEntry ) {
			if( this.mru === cacheEntry ) return;  // already in the MRU position, no need to do anything
			
			this.remove( cacheEntry );
			this.pushMru( cacheEntry );
		},
		
		
		/**
		 * Retrieves the "least recently used" (LRU) cache entry from the list and returns it.
		 * 
		 * @return {PromiseCache.CacheEntry}
		 */
		getLru : function() {
			return this.lru;
		},
		
		
		/**
		 * Removes a `cacheEntry` from the list.
		 * 
		 * @param {PromiseCache.CacheEntry} cacheEntry
		 */
		remove : function( cacheEntry ) {
			var next = cacheEntry.next,
			    prev = cacheEntry.prev;
			
			if( next ) next.prev = prev;
			if( prev ) prev.next = next;
			
			if( cacheEntry === this.mru ) this.mru = prev;
			if( cacheEntry === this.lru ) this.lru = next;
			
			cacheEntry.prev = cacheEntry.next = null;  // remove references to clean up memory and in case this same entry is to be re-inserted
		},
		
		
		/**
		 * Retrieves the list of CacheEntries in LRU order. Do not rely on its existence - this is used only for unit 
		 * testing, and may be removed or changed in the future.
		 * 
		 * @protected
		 * @return {PromiseCache.CacheEntry[]} Returns the cache entries in least recently used (LRU) order. That is,
		 *   the LRU entry is the beginning of the array, and the most recently used (MRU) entry is the end.
		 */
		getLruList : function() {
			var lruEntry = this.lru,
			    result = [];
			
			while( lruEntry ) {
				result.push( lruEntry );
				lruEntry = lruEntry.next;
			}
			return result;
		}
		
	} );
	
	
	return LruList;
	
} );
	