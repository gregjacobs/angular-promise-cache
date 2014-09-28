describe( 'PromiseCache', function() {
	
	var $q,
	    $rootScope,
	    PromiseCache;
	
	
	beforeEach( module( 'angular-promise-cache' ) );
	
	beforeEach( inject( function( _$q_, _$rootScope_, _PromiseCache_ ) {
		$q = _$q_;
		$rootScope = _$rootScope_;
		PromiseCache = _PromiseCache_;
	} ) );
	
	
	
	it( 'should be able to be instantiated without any arguments', function() {
		expect( function() {
			var promiseCache = new PromiseCache();
		} ).not.toThrow();
	} );
	
	
	describe( 'get()', function() {
		var promiseCache,
		    deferreds,
		    setterFn;
		
		beforeEach( function() {
			promiseCache = new PromiseCache();
			
			deferreds = [];
			setterFn = jasmine.createSpy( 'setterFn' ).andCallFake( createDeferred );		
		} );
		
		
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
		
		
		it( 'should remove a rejected promise from the cache, so subsequent "gets" for the same key issue a new request', function() {
			var promise0 = promiseCache.get( '1', setterFn );
			expect( setterFn.calls.length ).toBe( 1 );
			
			rejectDeferred( 0 );
			
			var promise1 = promiseCache.get( '1', setterFn );
			expect( setterFn.calls.length ).toBe( 2 );
			expect( promise0 ).not.toBe( promise1 );
		} );
		
	} );
	
} );