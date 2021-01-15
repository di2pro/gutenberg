/**
 * External dependencies
 */
import { without, zip } from 'lodash';

export function __experimentalCreateBatch( processor ) {
	const queue = [];
	let listeners = [];

	return {
		add( input ) {
			return new Promise( ( resolve, reject ) => {
				queue.push( {
					input,
					resolve,
					reject,
				} );

				for ( const listener of listeners ) {
					listener();
				}
			} );
		},

		getSize() {
			return queue.length;
		},

		waitForSize( size ) {
			if ( queue.length === size ) {
				return Promise.resolve();
			}

			return new Promise( ( resolve ) => {
				const listener = () => {
					if ( queue.length === size ) {
						resolve();
						listeners = without( listeners, listener );
					}
				};
				listeners.push( listener );
			} );
		},

		async process() {
			const results = await processor(
				queue.map( ( { input } ) => input )
			);

			if ( results.length !== queue.length ) {
				throw new Error(
					'process: Array returned by processor must be same size as input array.'
				);
			}

			let hasErrors = false;

			for ( const [ result, { resolve, reject } ] of zip(
				results,
				queue
			) ) {
				if ( result?.error ) {
					reject( result.error );
					hasErrors = true;
				} else {
					resolve( result?.ouptut ?? result );
				}
			}

			return {
				hasErrors,
				outputs: results.map( ( { output } ) => output ),
				errors: results.map( ( { error } ) => error ),
			};
		},
	};
}
