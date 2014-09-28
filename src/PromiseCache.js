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
	}
	
	
	PromiseCache.prototype = {
		constructor : PromiseCache,
		
		
		/**
		 * @cfg {Number} maxAge
		 * 
		 * A number, in milliseconds, of how long items may exist in the cache before being considered stale and removed.
		 */
		maxAge : Number.POSITIVE_INFINITY,
		
		
		/**
		 * Retrieves a Promise from the cache by the given `key`.
		 * 
		 * If `key` does not exist in the cache, the Promise is created using the `setter` function. The `setter`
		 * function **must** return a Promise object.
		 * 
		 * @param {String} key The key retrieve from the cache. If the key does not yet exist, the `setter` function
		 *   will be called, and stored under this key.
		 * @param {Function} setter The function to create the Promise in the cache.
		 * @return {Q.Promise}
		 */
		get : function( key, setter ) {
			if( !this.cache ) this.cache = {};  // lazily instantiate the cache map
			
			if( typeof setter !== 'function' ) {
				throw new Error( '`setter` arg required, and must be a function' );
			}
			
			var me = this,  // for closure
			    promise = this.cache[ key ];
			
			if( !promise ) {
				promise = setter();
				
				if( promise && typeof promise.then === 'function' ) {  // a little duck typing to determine if the object returned from `setter()` is a promise
					this.cache[ key ] = promise;
				} else {
					throw new Error( '`setter` function must return a Promise object' );
				}
				
				// If the deferred is rejected, remove it from the cache so that subsequent "gets" trigger a new request from the `setter`
				promise.then( null, function() { delete me.cache[ key ]; } );
			}
			
			return promise;
		}
		
	};
	
	
	return PromiseCache;

} );