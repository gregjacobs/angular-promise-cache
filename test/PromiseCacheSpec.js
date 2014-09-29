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
		
		promiseCache = new PromiseCache();  // note: may be overridden in certain tests
		
		deferreds = [];
		setterFn = jasmine.createSpy( 'setterFn' ).andCallFake( createDeferred );		
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
		
		beforeEach( function() {
			// Need to spy on the the Date prototype to implement the `maxAge` tests
			spyOn( Date.prototype, 'getTime' ).andReturn( 0 );
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
		
	} );
	
	
	describe( 'prune()', function() {
		
		beforeEach( function() {
			// Need to spy on the Date object to test this functionality
			spyOn( Date.prototype, 'getTime' ).andReturn( 0 );
			
			promiseCache = new PromiseCache( { maxAge: 1000 } );  // 1 second
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
	
} );