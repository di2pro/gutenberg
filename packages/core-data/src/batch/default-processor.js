/**
 * WordPress dependencies
 */
import apiFetch from '@wordpress/api-fetch';

export default async function defaultProcessor( requests ) {
	const batchResponse = await apiFetch( {
		path: '/v1/batch',
		method: 'POST',
		data: {
			validation: 'require-all-validate',
			requests: requests.map( ( request ) => ( {
				path: request.path,
				body: request.data, // Rename 'data' to 'body'.
				method: request.method,
				headers: request.headers,
			} ) ),
		},
	} );

	if ( batchResponse.failed ) {
		return batchResponse.responses.map( ( response ) => ( {
			error: response?.body,
		} ) );
	}

	return batchResponse.responses.map( ( response ) => {
		const result = {};
		if ( response.status >= 200 && response.status < 300 ) {
			result.output = response.body;
		} else {
			result.error = response.body;
		}
		return result;
	} );
}
