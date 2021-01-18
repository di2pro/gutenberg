/**
 * External dependencies
 */
import { without, zip } from 'lodash';

/**
 * Internal dependencies
 */
import defaultProcessor from './default-processor';

export default function createBatch( processor = defaultProcessor ) {
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
			let results;

			try {
				results = await processor(
					queue.map( ( { input } ) => input )
				);

				if ( results.length !== queue.length ) {
					throw new Error(
						'process: Array returned by processor must be same size as input array.'
					);
				}
			} catch ( error ) {
				for ( const { reject } of queue ) {
					reject( error );
				}

				throw error;
			}

			let isSuccess = true;

			for ( const [ result, { resolve, reject } ] of zip(
				results,
				queue
			) ) {
				if ( result?.error ) {
					reject( result.error );
					isSuccess = false;
				} else {
					resolve( result?.output ?? result );
				}
			}

			return isSuccess;
		},
	};
}
