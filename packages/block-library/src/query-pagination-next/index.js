/**
 * WordPress dependencies
 */
import { _x, __ } from '@wordpress/i18n';

/**
 * Internal dependencies
 */
import metadata from './block.json';
import edit from './edit';

const { name } = metadata;
export { metadata, name };

export const settings = {
	title: _x( 'Query Pagination Next', 'block title' ),
	description: __( 'Displays the next posts page link.' ),
	// TODO create icon
	edit,
	parent: [ 'core/query-pagination' ],
};
