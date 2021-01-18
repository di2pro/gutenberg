/**
 * External dependencies
 */
import { createStore, applyMiddleware } from 'redux';
import { flowRight, get, mapValues, omit } from 'lodash';
import combineReducers from 'turbo-combine-reducers';
import EquivalentKeyMap from 'equivalent-key-map';

/**
 * WordPress dependencies
 */
import createReduxRoutineMiddleware from '@wordpress/redux-routine';

/**
 * Internal dependencies
 */
import { builtinControls } from '../controls';
import promise from '../promise-middleware';
import createResolversCacheMiddleware from '../resolvers-cache-middleware';
import createThunkMiddleware from './thunk-middleware';
import metadataReducer from './metadata/reducer';
import * as metadataSelectors from './metadata/selectors';
import * as metadataActions from './metadata/actions';

/** @typedef {import('../types').WPDataRegistry} WPDataRegistry */
/** @typedef {import('../types').WPDataStore} WPDataStore */
/** @typedef {import('../types').WPDataReduxStoreConfig} WPDataReduxStoreConfig */

/**
 * Create a cache to track whether resolvers started running or not.
 *
 * @return {Object} Resolvers Cache.
 */
function createResolversCache() {
	const cache = {};
	return {
		isRunning( selectorName, args ) {
			return cache[ selectorName ] && cache[ selectorName ].get( args );
		},

		clear( selectorName, args ) {
			if ( cache[ selectorName ] ) {
				cache[ selectorName ].delete( args );
			}
		},

		markAsRunning( selectorName, args ) {
			if ( ! cache[ selectorName ] ) {
				cache[ selectorName ] = new EquivalentKeyMap();
			}

			cache[ selectorName ].set( args, true );
		},
	};
}

/**
 * Creates a data store definition for the provided Redux store options containing
 * properties describing reducer, actions, selectors, controls and resolvers.
 *
 * @example
 * ```js
 * import { createReduxStore } from '@wordpress/data';
 *
 * const store = createReduxStore( 'demo', {
 *     reducer: ( state = 'OK' ) => state,
 *     selectors: {
 *         getValue: ( state ) => state,
 *     },
 * } );
 * ```
 *
 * @param {string}                 key      Unique namespace identifier.
 * @param {WPDataReduxStoreConfig} options  Registered store options, with properties
 *                                          describing reducer, actions, selectors,
 *                                          and resolvers.
 *
 * @return {WPDataStore} Store Object.
 */
export default function createReduxStore( key, options ) {
	return {
		name: key,
		instantiate: ( registry ) => {
			const reducer = options.reducer;
			const thunkArgs = {
				registry,
				get dispatch() {
					return getActions();
				},
				get select() {
					return getSelectors();
				},
				get resolveSelect() {
					return getResolveSelectors();
				},
			};

			const store = instantiateReduxStore(
				key,
				options,
				registry,
				thunkArgs
			);
			const resolversCache = createResolversCache();

			let resolvers;
			const actions = mapValues(
				{ ...metadataActions, ...options.actions },
				( action ) => ( ...args ) =>
					Promise.resolve( store.dispatch( action( ...args ) ) )
			);

			let selectors = mapSelectors(
				{
					...mapValues(
						metadataSelectors,
						( selector ) => ( state, ...args ) =>
							selector( state.metadata, ...args )
					),
					...mapValues( options.selectors, ( selector ) => {
						if ( selector.isRegistrySelector ) {
							selector.registry = registry;
						}

						return ( state, ...args ) =>
							selector( state.root, ...args );
					} ),
				},
				store
			);
			if ( options.resolvers ) {
				const result = mapResolvers(
					options.resolvers,
					selectors,
					store,
					registry,
					resolversCache
				);
				resolvers = result.resolvers;
				selectors = result.selectors;
			}

			const getSelectors = () => {
				const rv = ( s ) => s( store.__unstableOriginalGetState() );
				Object.assign( rv, selectors );
				return rv;
			};

			const getActions = () => {
				const rv = ( a ) => store.dispatch( a );
				Object.assign( rv, actions );
				return rv;
			};

			// We have some modules monkey-patching the store object
			// It's wrong to do so but until we refactor all of our effects to controls
			// We need to keep the same "store" instance here.
			store.__unstableOriginalGetState = store.getState;
			store.getState = () => store.__unstableOriginalGetState().root;

			// Customize subscribe behavior to call listeners only on effective change,
			// not on every dispatch.
			const subscribe =
				store &&
				( ( listener ) => {
					let lastState = store.__unstableOriginalGetState();
					return store.subscribe( () => {
						const state = store.__unstableOriginalGetState();
						const hasChanged = state !== lastState;
						lastState = state;

						if ( hasChanged ) {
							listener();
						}
					} );
				} );

			const getResolveSelectors = () =>
				mapValues(
					omit( getSelectors(), [
						'getIsResolving',
						'hasStartedResolution',
						'hasFinishedResolution',
						'isResolving',
						'getCachedResolvers',
					] ),
					( selector, selectorName ) => {
						return ( ...args ) => {
							return new Promise( ( resolve ) => {
								const hasFinished = () =>
									selectors.hasFinishedResolution(
										selectorName,
										args
									);
								const getResult = () =>
									selector.apply( null, args );

								// trigger the selector (to trigger the resolver)
								const result = getResult();
								if ( hasFinished() ) {
									return resolve( result );
								}

								const unsubscribe = subscribe( () => {
									if ( hasFinished() ) {
										unsubscribe();
										resolve( getResult() );
									}
								} );
							} );
						};
					}
				);

			// This can be simplified to just { subscribe, getSelectors, getActions }
			// Once we remove the use function.
			return {
				reducer,
				store,
				actions,
				selectors,
				resolvers,
				getSelectors,
				__experimentalGetResolveSelectors: getResolveSelectors,
				getActions,
				subscribe,
			};
		},
	};
}

/**
 * Creates a redux store for a namespace.
 *
 * @param {string} key      Unique namespace identifier.
 * @param {Object} options  Registered store options, with properties
 * describing reducer, actions, selectors,
 * and resolvers.
 * @param {WPDataRegistry} registry Registry reference.
 * @param {Object} thunkArgs
 * @return {Object} Newly created redux store.
 */
function instantiateReduxStore( key, options, registry, thunkArgs ) {
	const controls = {
		...options.controls,
		...builtinControls,
	};

	const normalizedControls = mapValues( controls, ( control ) =>
		control.isRegistryControl ? control( registry ) : control
	);

	const middlewares = [
		createResolversCacheMiddleware( registry, key ),
		promise,
		createReduxRoutineMiddleware( normalizedControls ),
		createThunkMiddleware( thunkArgs ),
	];

	const enhancers = [ applyMiddleware( ...middlewares ) ];
	if (
		typeof window !== 'undefined' &&
		window.__REDUX_DEVTOOLS_EXTENSION__
	) {
		enhancers.push(
			window.__REDUX_DEVTOOLS_EXTENSION__( {
				name: key,
				instanceId: key,
			} )
		);
	}

	const { reducer, initialState } = options;
	const enhancedReducer = combineReducers( {
		metadata: metadataReducer,
		root: reducer,
	} );

	return createStore(
		enhancedReducer,
		{ root: initialState },
		flowRight( enhancers )
	);
}

/**
 * Maps selectors to a store.
 *
 * @param {Object} selectors Selectors to register. Keys will be used as the
 *                           public facing API. Selectors will get passed the
 *                           state as first argument.
 * @param {Object} store     The store to which the selectors should be mapped.
 * @return {Object} Selectors mapped to the provided store.
 */
function mapSelectors( selectors, store ) {
	const createStateSelector = ( registrySelector ) => {
		const selector = function runSelector() {
			// This function is an optimized implementation of:
			//
			//   selector( store.getState(), ...arguments )
			//
			// Where the above would incur an `Array#concat` in its application,
			// the logic here instead efficiently constructs an arguments array via
			// direct assignment.
			const argsLength = arguments.length;
			const args = new Array( argsLength + 1 );
			args[ 0 ] = store.__unstableOriginalGetState();
			for ( let i = 0; i < argsLength; i++ ) {
				args[ i + 1 ] = arguments[ i ];
			}

			return registrySelector( ...args );
		};
		selector.hasResolver = false;
		return selector;
	};

	return mapValues( selectors, createStateSelector );
}

/**
 * Returns resolvers with matched selectors for a given namespace.
 * Resolvers are side effects invoked once per argument set of a given selector call,
 * used in ensuring that the data needs for the selector are satisfied.
 *
 * @param {Object} resolvers      Resolvers to register.
 * @param {Object} selectors      The current selectors to be modified.
 * @param {Object} store          The redux store to which the resolvers should be mapped.
 * @param {Object} registry
 * @param {Object} resolversCache Resolvers Cache.
 */
function mapResolvers( resolvers, selectors, store, registry, resolversCache ) {
	// The `resolver` can be either a function that does the resolution, or, in more advanced
	// cases, an object with a `fullfill` method and other optional methods like `isFulfilled`.
	// Here we normalize the `resolver` function to an object with `fulfill` method.
	const mappedResolvers = mapValues( resolvers, ( resolver ) => {
		if ( resolver.fulfill ) {
			return resolver;
		}

		return {
			...resolver, // copy the enumerable properties of the resolver function
			fulfill: resolver, // add the fulfill method
		};
	} );

	const mapSelector = ( selector, selectorName ) => {
		const resolver = resolvers[ selectorName ];
		if ( ! resolver ) {
			selector.hasResolver = false;
			return selector;
		}

		const selectorResolver = ( ...args ) => {
			async function fulfillSelector() {
				const state = store.getState();
				if (
					resolversCache.isRunning( selectorName, args ) ||
					( typeof resolver.isFulfilled === 'function' &&
						resolver.isFulfilled( state, ...args ) )
				) {
					return;
				}

				const { metadata } = store.__unstableOriginalGetState();

				if (
					metadataSelectors.hasStartedResolution(
						metadata,
						selectorName,
						args
					)
				) {
					return;
				}

				resolversCache.markAsRunning( selectorName, args );

				setTimeout( async () => {
					resolversCache.clear( selectorName, args );
					store.dispatch(
						metadataActions.startResolution( selectorName, args )
					);
					await fulfillResolver(
						store,
						mappedResolvers,
						selectorName,
						...args
					);
					store.dispatch(
						metadataActions.finishResolution( selectorName, args )
					);
				} );
			}

			fulfillSelector( ...args );
			return selector( ...args );
		};
		selectorResolver.hasResolver = true;
		return selectorResolver;
	};

	return {
		resolvers: mappedResolvers,
		selectors: mapValues( selectors, mapSelector ),
	};
}

/**
 * Calls a resolver given arguments
 *
 * @param {Object} store        Store reference, for fulfilling via resolvers
 * @param {Object} resolvers    Store Resolvers
 * @param {string} selectorName Selector name to fulfill.
 * @param {Array} args          Selector Arguments.
 */
async function fulfillResolver( store, resolvers, selectorName, ...args ) {
	const resolver = get( resolvers, [ selectorName ] );
	if ( ! resolver ) {
		return;
	}

	const action = resolver.fulfill( ...args );
	if ( action ) {
		await store.dispatch( action );
	}
}
