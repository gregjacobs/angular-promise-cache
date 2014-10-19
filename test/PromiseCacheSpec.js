describe( 'PromiseCache', function() {
	
	var $q,
	    $rootScope,
	    PromiseCache,
	    
	    promiseCache,  // for the instance
	    deferreds,     // an array of deferreds created when the `setterFn` is called
	    setterFn;
	
	
	beforeEach( module( 'angular-promise-cache' ) );
	
	beforeEach( inject( function( _$q_, _$rootScope_, _PromiseCache_ ) {
		$q = _$q_;
		$rootScope = _$rootScope_;
		PromiseCache = _PromiseCache_;
		
		deferreds = [];
		setterFn = jasmine.createSpy( 'setterFn' ).andCallFake( createDeferred );
		
		// For tests that involve the pruning interval
		spyOn( window, 'setInterval' ).andCallThrough();
		spyOn( window, 'clearInterval' ).andCallThrough();
	} ) );
	
	
		
	function createDeferred() {
		var deferred = $q.defer();
		deferreds.push( deferred );
		
		return deferred.promise;
	}
	
	function resolveDeferred( deferredIdx ) {
		deferreds[ deferredIdx ].resolve();
		$rootScope.$digest();
	}
	
	function rejectDeferred( deferredIdx ) {
		deferreds[ deferredIdx ].reject();
		$rootScope.$digest();
	}
	
	
	it( 'should be able to be instantiated without any arguments', function() {
		expect( function() {
			var promiseCache = new PromiseCache();
		} ).not.toThrow();
	} );
	
	
	describe( 'get()', function() {
		var promiseCache;
		
		beforeEach( function() {
			promiseCache = new PromiseCache();
		} );
		
		
		it( 'should throw an error if the `setter` argument is not provided', function() {
			expect( function() {
				promiseCache.get( '1' );
			} ).toThrow( '`setter` arg required, and must be a function' );
		} );
		
		
		it( 'should throw an error if the `setter` function does not return a promise', function() {
			expect( function() {
				promiseCache.get( '1', function() { return; } );
			} ).toThrow( '`setter` function must return a Promise object' );
			
			expect( function() {
				promiseCache.get( '2', function() { return null; } );
			} ).toThrow( '`setter` function must return a Promise object' );
			
			expect( function() {
				promiseCache.get( '3', function() { return {}; } );  // returning anonymous object
			} ).toThrow( '`setter` function must return a Promise object' );
		} );
		
		
		it( 'should return a cached promise object when one has been set into the cache', function() {
			var promise0 = promiseCache.get( '1', setterFn );
			expect( setterFn.calls.length ).toBe( 1 );
			
			var promise1 = promiseCache.get( '1', setterFn );
			expect( setterFn.calls.length ).toBe( 1 );  // still should only be called one time
			expect( promise0 ).toBe( promise1 );
		} );
		
		
		it( 'should return a cached promise object when one has been set into the cache, even after it has already been resolved', function() {
			var promise0 = promiseCache.get( '1', setterFn );
			expect( setterFn.calls.length ).toBe( 1 );
			
			resolveDeferred( 0 );
			
			var promise1 = promiseCache.get( '1', setterFn );
			expect( setterFn.calls.length ).toBe( 1 );  // still should only be called one time
			expect( promise0 ).toBe( promise1 );
		} );
		
		
		it( 'should return a new promise object when different keys are requested', function() {
			var promise0 = promiseCache.get( '1', setterFn );
			expect( setterFn.calls.length ).toBe( 1 );
			
			var promise1 = promiseCache.get( '2', setterFn );
			expect( setterFn.calls.length ).toBe( 2 );
			expect( promise0 ).not.toBe( promise1 );
		} );
		
		
		describe( 'removal when promise\'s deferred is rejected', function() { 
			
			it( 'should remove a rejected promise from the cache, so subsequent "gets" for the same key issue a new request', function() {
				var promise0 = promiseCache.get( '1', setterFn );
				expect( setterFn.calls.length ).toBe( 1 );
				
				rejectDeferred( 0 );
				
				var promise1 = promiseCache.get( '1', setterFn );
				expect( setterFn.calls.length ).toBe( 2 );
				expect( promise0 ).not.toBe( promise1 );
			} );
			
			
			it( 'should have no effect (not erroring) when a promise is rejected after the cache entry has been removed', function() {
				var promise0 = promiseCache.get( '1', setterFn );
				
				promiseCache.remove( '1' );
				
				expect( function() {
					rejectDeferred( 0 );
				} ).not.toThrow();
			} );
			
			
			it( 'should *not* error when a promise is rejected after the cache has been cleared (i.e. from using the clear() method)', function() {
				var promise0 = promiseCache.get( '1', setterFn );
				
				promiseCache.clear();
				
				expect( function() {
					rejectDeferred( 0 );
				} ).not.toThrow();
			} );
			
			
			it( 'should *not* remove a newer cache entry under the same key name, when an older cache entry\'s promise is rejected', function() {
				// First, add a promise and remove it
				var promise0 = promiseCache.get( '1', setterFn );
				promiseCache.remove( '1' );  // immediately remove
				
				// Second, add another promise under the same key name
				var promise1 = promiseCache.get( '1', setterFn );
				expect( promiseCache.has( '1' ) ).toBe( true );  // initial condition
				
				// Now, reject the first deferred. This should *not* remove the newer entry from the cache
				rejectDeferred( 0 );
				
				expect( promiseCache.has( '1' ) ).toBe( true );  // should still be here
			} );
			
		} );
		
		
		describe( 'maxSize handling (LRU functionality)', function() {
			
			beforeEach( function() {
				promiseCache = new PromiseCache( { maxSize: 3 } );
			} );
			
			
			/*
			 * @param {String} key A key to put into the cache.
			 */
			function putKey( key ) {
				promiseCache.get( key, setterFn );
			}
			
			/*
			 * Basically the same as putKey, but illustrates that the key is being retrieved
			 * 
			 * @param {String} key A key to put into the cache.
			 */
			function getKey( key ) {
				if( !promiseCache.has( key ) ) throw new Error( "The key `" + key + "` was not in the cache" );
				
				promiseCache.get( key, setterFn );
			}
			
			/*
			 * @param {String} key The key to remove from the cache.
			 */
			function removeKey( key ) {
				promiseCache.remove( key );
			}
			
			/*
			 * @param {String[]} keys The keys to expect in the cache, in order of LRU to MRU.
			 */
			function expectLruList( keys ) {
				expect( promiseCache.getSize() ).toBe( keys.length );
				
				var lruList = ( promiseCache.lruList ) ? promiseCache.lruList.getLruEntries() : [];  // lruList may not exist when there are no entries
				expect( getKeys( lruList ) ).toEqual( keys );
				
				expectLruToBe( keys[ 0 ] || null );
				expectMruToBe( keys[ keys.length - 1 ] || null );
				
				// Check that each key actually exists in the cache's map
				keys.forEach( function( key ) { 
					if( !promiseCache.has( key ) )  // so we can give a better error message than "expected false to be true"
						expect( key ).toBe( "found in the cache" );
				} );
			}
			
			function getKeys( cacheEntries ) {
				return cacheEntries.map( function( entry ) { return entry.getKey(); } );
			}
			
			function expectMruToBe( key ) {
				if( key === null ) {
					expect( promiseCache.lruList ).toBe( null );
				} else {
					expect( promiseCache.lruList.mru.getKey() ).toBe( key );
				}
			}
			
			function expectLruToBe( key ) {
				if( key === null ) {
					expect( promiseCache.lruList ).toBe( null );
				} else {
					expect( promiseCache.lruList.lru.getKey() ).toBe( key );
				}
			}
			
			
			it( 'should remove entries on a least-recently-used (LRU) basis as entries are added', function() {
				expectLruList( [] );
				
				putKey( '1' );
				putKey( '2' );
				putKey( '3' );
				expectLruList( [ '1', '2', '3' ] );
				
				putKey( '4' );
				expectLruList( [ '2', '3', '4' ] );
				
				putKey( '5' );
				expectLruList( [ '3', '4', '5' ] );
			} );
			
			
			it( 'should remove entries on a least-recently-used (LRU) basis as entries are added (bigger test)', function() {
				for( var i = 1; i <= 50; i++ ) {
					putKey( i + '' );
				}
				expectLruList( [ '48', '49', '50' ] );
			} );
			
			
			it( 'retrieving a cache entry should move the entry to the end of the LRU list', function() {
				putKey( '1' );
				putKey( '2' );
				putKey( '3' );
				expectLruList( [ '1', '2', '3' ] );
				
				getKey( '2' );
				expectLruList( [ '1', '3', '2' ] );
				
				getKey( '2' );
				expectLruList( [ '1', '3', '2' ] );  // 2 stays at the MRU position
				
				getKey( '1' );
				expectLruList( [ '3', '2', '1' ] );
				
				getKey( '1' );
				expectLruList( [ '3', '2', '1' ] );  // 1 stays at the MRU position
				
				getKey( '3' );
				expectLruList( [ '2', '1', '3' ] );
			} );
			
			
			it( 'manually removing an entry should remove the entry properly from the beginning of the LRU list', function() {
				putKey( '1' );
				putKey( '2' );
				putKey( '3' );
				expectLruList( [ '1', '2', '3' ] );
				
				removeKey( '1' );
				expectLruList( [ '2', '3' ] );
			} );
			
			
			it( 'manually removing an entry should remove the entry properly from the end of the LRU list', function() {
				putKey( '1' );
				putKey( '2' );
				putKey( '3' );
				expectLruList( [ '1', '2', '3' ] );
				
				removeKey( '3' );
				expectLruList( [ '1', '2' ] );
			} );
			
			
			it( 'manually removing an entry should remove the entry properly from the middle of the LRU list', function() {
				putKey( '1' );
				putKey( '2' );
				putKey( '3' );
				expectLruList( [ '1', '2', '3' ] );
				
				removeKey( '2' );
				expectLruList( [ '1', '3' ] );
			} );
			
			
			it( 'manually removing all entries should remove them from the LRU list', function() {
				putKey( '1' );
				putKey( '2' );
				putKey( '3' );
				expectLruList( [ '1', '2', '3' ] );
				
				removeKey( '2' );
				expectLruList( [ '1', '3' ] );
				
				removeKey( '1' );
				expectLruList( [ '3' ] );
				
				removeKey( '3' );
				expectLruList( [] );
			} );
			
			
			it( 'should handle adding and removing one item from the cache', function() {
				putKey( '1' );
				expectLruList( [ '1' ] );
				
				removeKey( '1' );
				expectLruList( [] );
			} );
			
		} );
		
		
		describe( 'maxAge handling', function() {
			
			beforeEach( function() {
				// Need to spy on the Date object to test this functionality
				spyOn( Date.prototype, 'getTime' ).andReturn( 0 );
				
				promiseCache = new PromiseCache( { maxAge: 1000 } );  // 1 second
			} );
			
			
			it( 'should return the cache entry if the entry has not yet expired', function() {
				var promise0 = promiseCache.get( '1', setterFn );
				expect( setterFn.calls.length ).toBe( 1 );
				
				Date.prototype.getTime.andReturn( 1000 );  // maxAge is inclusive, so should still receive the cached promise
				var promise1 = promiseCache.get( '1', setterFn );
				expect( setterFn.calls.length ).toBe( 1 );
				expect( promise0 ).toBe( promise1 );
			} );
			
			
			it( 'should call the `setter` to create a new cache entry if the maxAge has elapsed', function() {
				var promise0 = promiseCache.get( '1', setterFn );
				expect( setterFn.calls.length ).toBe( 1 );
				
				Date.prototype.getTime.andReturn( 1001 );
				var promise1 = promiseCache.get( '1', setterFn );
				expect( setterFn.calls.length ).toBe( 2 );
				expect( promise0 ).not.toBe( promise1 );
				
				// Test that subsequent calls get the 2nd promise (promise1)
				var promise2 = promiseCache.get( '1', setterFn );
				expect( setterFn.calls.length ).toBe( 2 );
				expect( promise1 ).toBe( promise2 );
			} );
			
		} );
		
	} );
	
	
	describe( 'getSize()', function() {
		var promiseCache;
		
		beforeEach( function() {
			promiseCache = new PromiseCache();
		} );
		
		
		it( 'should return the number of entries in the cache at any given time', function() {
			expect( promiseCache.getSize() ).toBe( 0 );
			
			promiseCache.get( '1', setterFn );
			expect( promiseCache.getSize() ).toBe( 1 );
			
			promiseCache.get( '2', setterFn );
			expect( promiseCache.getSize() ).toBe( 2 );
			
			promiseCache.remove( '1' );
			expect( promiseCache.getSize() ).toBe( 1 );
			
			promiseCache.remove( '2' );
			expect( promiseCache.getSize() ).toBe( 0 );
		} );
		
		
		it( 'should return the proper value if the promise created by a `setter` function is immediately rejected', function() {
			var rejectedPromiseSetterFn = function() { return $q.reject(); };
			
			promiseCache.get( '1', setterFn );
			expect( promiseCache.getSize() ).toBe( 1 );  // normal promise
			
			promiseCache.get( '2', rejectedPromiseSetterFn );
			$rootScope.$digest();  // must $digest() to reject the promise
			
			expect( promiseCache.getSize() ).toBe( 1 );  // rejected promise should remove the promise, thus not increasing the count
		} );
		
	} );
	
	
	describe( 'has()', function() {
		var promiseCache;
		
		beforeEach( function() {
			// Need to spy on the the Date prototype to implement the `maxAge` tests
			spyOn( Date.prototype, 'getTime' ).andReturn( 0 );
			
			promiseCache = new PromiseCache();
		} );
		
		
		it( 'should return `false` when no entries have yet been added to the cache', function() {
			expect( promiseCache.has( '1' ) ).toBe( false );
		} );
		
		
		it( 'should return `true` when an entry does exist in the cache', function() {
			var promise0 = promiseCache.get( '1', setterFn );
			
			expect( promiseCache.has( '1' ) ).toBe( true );
		} );
		
		
		it( 'should return `false` when an entry does not yet exist in the cache', function() {
			var promise0 = promiseCache.get( '1', setterFn );
			
			expect( promiseCache.has( '2' ) ).toBe( false );
		} );
		
		
		it( 'should return `false` when an entry does exist in the cache, but it has expired from the `maxAge` setting', function() {
			var promiseCache = new PromiseCache( { maxAge: 1000 } );
			promiseCache.get( '1', setterFn );
			expect( promiseCache.has( '1' ) ).toBe( true );  // initial condition
			
			Date.prototype.getTime.andReturn( 1000 );  // not yet expired, since maxAge is inclusive
			expect( promiseCache.has( '1' ) ).toBe( true );
			
			Date.prototype.getTime.andReturn( 1001 );  // now expired
			expect( promiseCache.has( '1' ) ).toBe( false );
		} );
		
	} );
	
	
	describe( 'remove()', function() {
		var promiseCache;
		
		beforeEach( function() {
			promiseCache = new PromiseCache();
		} );
		
		
		it( 'should not throw an error if called when there are no cache entries', function() {
			expect( function() {
				promiseCache.remove( '1' );
			} ).not.toThrow();
		} );
		
		
		it( 'should remove an entry from the cache by its key', function() {
			promiseCache.get( '1', setterFn );
			promiseCache.get( '2', setterFn );
			
			promiseCache.remove( '1' );
			expect( promiseCache.has( '1' ) ).toBe( false );
			expect( promiseCache.has( '2' ) ).toBe( true );
			
			promiseCache.remove( '2' );
			expect( promiseCache.has( '1' ) ).toBe( false );
			expect( promiseCache.has( '2' ) ).toBe( false );
		} );
		
		
		it( 'should remove the internal cache map when the last item has been removed', function() {
			promiseCache.get( '1', setterFn );
			promiseCache.get( '2', setterFn );
			expect( angular.isObject( promiseCache.cache ) ).toBe( true );  // initial condition
			
			promiseCache.remove( '1' );
			expect( angular.isObject( promiseCache.cache ) ).toBe( true );  // still an object after first removal
			
			promiseCache.remove( '2' );
			expect( promiseCache.cache ).toBe( null );  // removed last item, set back to `null`
		} );
		
	} );
	
	
	describe( 'clear()', function() {
		var promiseCache;
		
		beforeEach( function() {
			promiseCache = new PromiseCache();
		} );
		
		
		it( 'should clear the cache, forcing new calls to get() to create new promises', function() {
			var promise0 = promiseCache.get( '1', setterFn );
			var promise1 = promiseCache.get( '2', setterFn );
			expect( setterFn.calls.length ).toBe( 2 );  // initial condition
			
			promiseCache.clear();
			
			var promise2 = promiseCache.get( '1', setterFn );
			var promise3 = promiseCache.get( '2', setterFn );
			expect( setterFn.calls.length ).toBe( 4 );
			expect( promise2 ).toBe( deferreds[ 2 ].promise );  // make sure that the promises
			expect( promise3 ).toBe( deferreds[ 3 ].promise );  // are the correct objects
		} );
		
		
		it( 'should properly maintain the `size` property when cleared', function() {
			var promise0 = promiseCache.get( '1', setterFn );
			var promise1 = promiseCache.get( '2', setterFn );
			expect( promiseCache.getSize() ).toBe( 2 );  // initial condition
			
			promiseCache.clear();
			
			expect( promiseCache.getSize() ).toBe( 0 );
		} );
		
		
		it( 'should stop the pruningInterval if it is running', function() {
			promiseCache = new PromiseCache( { maxAge: 1000 } );  // 1 second
			promiseCache.get( '1', setterFn );
			promiseCache.get( '2', setterFn );
			
			// Check initial conditions
			var pruningIntervalId = promiseCache.pruningIntervalId;
			expect( pruningIntervalId ).toBeTruthy();
			expect( window.setInterval.calls.length ).toBe( 1 );
			expect( window.clearInterval ).not.toHaveBeenCalled();
			
			promiseCache.clear();
			expect( window.setInterval.calls.length ).toBe( 1 );  // no more calls to setInterval()
			expect( window.clearInterval ).toHaveBeenCalledWith( pruningIntervalId );
			expect( promiseCache.pruningIntervalId ).toBe( null );
		} );
		
	} );
	
	
	describe( 'prune()', function() {
		var promiseCache;
		
		beforeEach( function() {
			// Need to spy on the Date object to test this functionality
			spyOn( Date.prototype, 'getTime' ).andReturn( 0 );
			
			promiseCache = new PromiseCache( { maxAge: 1000 } );  // 1 second
		} );
		
		
		it( 'should have no effect on an empty PromiseCache', function() {
			expect( function() {
				promiseCache.prune();
			} ).not.toThrow();
		} );
		
		
		it( 'should not remove any cache entries if none are expired', function() {
			var promise0 = promiseCache.get( '1', setterFn );
			var promise1 = promiseCache.get( '2', setterFn );
			expect( setterFn.calls.length ).toBe( 2 );  // initial condition
			
			Date.prototype.getTime.andReturn( 1000 );  // since maxAge values are inclusive, entries are not yet expired
			
			var promise2 = promiseCache.get( '1', setterFn );
			var promise3 = promiseCache.get( '2', setterFn );
			expect( setterFn.calls.length ).toBe( 2 );
			expect( promise0 ).toBe( promise2 );  // same cache entry
			expect( promise1 ).toBe( promise3 );  // same cache entry
		} );
		
		
		it( 'should remove only the cache entries that have expired', function() {
			Date.prototype.getTime.andReturn( 0 );  // just to be clear, adding at 0ms time
			var promise0 = promiseCache.get( '1', setterFn );
			var promise1 = promiseCache.get( '2', setterFn );
			
			Date.prototype.getTime.andReturn( 500 );
			var promise2 = promiseCache.get( '3', setterFn );
			var promise3 = promiseCache.get( '4', setterFn );
			
			Date.prototype.getTime.andReturn( 1001 );  // should expire entries '1' and '2'
			promiseCache.prune();
			
			// Check internal properties to make sure the entries have been removed
			expect( promiseCache.cache[ '1' ] ).toBeUndefined();
			expect( promiseCache.cache[ '2' ] ).toBeUndefined();
			expect( promiseCache.cache[ '3' ] ).not.toBeUndefined();
			expect( promiseCache.cache[ '4' ] ).not.toBeUndefined();
		} );
		
	} );
	
	
	describe( 'automatic pruning of old entries on the `pruneInterval`', function() {
		var promiseCache;
		
		beforeEach( function() {
			jasmine.Clock.useMock();
			
			spyOn( Date.prototype, 'getTime' ).andReturn( 0 );  // for testing the pruning on the maxAge
		} );
		
		
		afterEach( function() {
			if( promiseCache ) promiseCache.destroy();
			
			// Make sure there are always an equal number of setInterval and clearInterval calls.
			// Not perfect since clearInterval() can be called with a wrong interval ID, but should
			// catch problems if there are any.
			expect( window.setInterval.calls.length ).toBe( window.clearInterval.calls.length );
		} );
		
		
		it( 'should not start a prune interval for an empty cache', function() {
			promiseCache = new PromiseCache( { maxAge: 1000, pruneInterval: 1000 } );
			
			expect( window.setInterval ).not.toHaveBeenCalled();
		} );
		
		
		it( 'should not start a prune interval if no `maxAge` is set', function() {
			promiseCache = new PromiseCache( { maxAge: null, pruneInterval: 1000 } );
			promiseCache.get( '1', setterFn );
			
			expect( window.setInterval ).not.toHaveBeenCalled();
		} );
		
		
		it( 'should not start a prune interval if `pruneInterval` is set to `null`', function() {
			promiseCache = new PromiseCache( { maxAge: 1000, pruneInterval: null } );
			promiseCache.get( '1', setterFn );
			
			expect( window.setInterval ).not.toHaveBeenCalled();
		} );
		
		
		it( 'should start a prune interval when there is a `maxAge` and a `pruneInterval`, and an item is added to the cache', function() {
			promiseCache = new PromiseCache( { maxAge: 1000, pruneInterval: 1000 } );
			promiseCache.get( '1', setterFn );
			
			expect( window.setInterval ).toHaveBeenCalled();
		} );
		
		
		it( 'should only call setInterval() to start the pruning interval once, even if multiple items are added', function() {
			promiseCache = new PromiseCache( { maxAge: 1000, pruneInterval: 1000 } );
			promiseCache.get( '1', setterFn );
			promiseCache.get( '2', setterFn );
			
			expect( window.setInterval.calls.length ).toBe( 1 );
		} );
		
		
		it( 'should stop the prune interval when all entries in the cache are removed', function() {
			promiseCache = new PromiseCache( { maxAge: 1000, pruneInterval: 1000 } );
			promiseCache.get( '1', setterFn );
			promiseCache.get( '2', setterFn );
			
			expect( window.setInterval ).toHaveBeenCalled();
			expect( window.clearInterval ).not.toHaveBeenCalled();
			
			promiseCache.remove( '1', setterFn );
			expect( window.clearInterval ).not.toHaveBeenCalled();
			
			promiseCache.remove( '2', setterFn );
			expect( window.clearInterval ).toHaveBeenCalled();
		} );
		
		
		it( 'should stop the prune interval when the PromiseCache is cleared', function() {
			promiseCache = new PromiseCache( { maxAge: 1000, pruneInterval: 1000 } );
			promiseCache.get( '1', setterFn );
			promiseCache.get( '2', setterFn );
			expect( window.setInterval ).toHaveBeenCalled();        // initial condition
			expect( window.clearInterval ).not.toHaveBeenCalled();  // initial condition
			
			promiseCache.clear();
			expect( window.clearInterval ).toHaveBeenCalled();
		} );
		
		
		it( 'should stop the prune interval when the PromiseCache is destroyed', function() {
			promiseCache = new PromiseCache( { maxAge: 1000, pruneInterval: 1000 } );
			promiseCache.get( '1', setterFn );
			promiseCache.get( '2', setterFn );
			expect( window.setInterval ).toHaveBeenCalled();        // initial condition
			expect( window.clearInterval ).not.toHaveBeenCalled();  // initial condition
			
			promiseCache.destroy();
			expect( window.clearInterval ).toHaveBeenCalled();
		} );
		
		
		it( 'should prune the cache (removing old entries) on the interval', function() {
			promiseCache = new PromiseCache( { maxAge: 500, pruneInterval: 1000 } );
			
			Date.prototype.getTime.andReturn( 0 );  // just to be clear
			promiseCache.get( '1', setterFn );
			expect( promiseCache.has( '1' ) ).toBe( true );
			
			jasmine.Clock.tick( 1000 );
			Date.prototype.getTime.andReturn( 1000 );
			expect( promiseCache.has( '1' ) ).toBe( false );
		} );
		
	} );
	
	
	describe( 'destroy()', function() {
		var promiseCache;
		
		beforeEach( function() {
			promiseCache = new PromiseCache( { maxAge: 1000 } );
		} );
		
		
		it( 'should clear the cache, and stop the pruning interval if it\'s running', function() {
			promiseCache.get( '1', setterFn );
			promiseCache.get( '2', setterFn );
			
			expect( promiseCache.getSize() ).toBe( 2 );             // initial condition
			expect( window.setInterval ).toHaveBeenCalled();        // initial condition
			expect( window.clearInterval ).not.toHaveBeenCalled();  // initial condition
			
			promiseCache.destroy();
			expect( promiseCache.getSize() ).toBe( 0 );
			expect( window.clearInterval.calls.length ).toBe( 1 );
		} );
		
	} );
	
} );