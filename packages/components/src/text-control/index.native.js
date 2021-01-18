/**
 * WordPress dependencies
 */
import { memo } from '@wordpress/element';
/**
 * Internal dependencies
 */
import Cell from '../mobile/bottom-sheet/cell';

const TextControl = memo(
	( {
		label,
		hideLabelFromVision,
		value,
		help,
		className,
		instanceId,
		onChange,
		type = 'text',
		...props
	} ) => {
		const id = `inspector-text-control-${ instanceId }`;

		return (
			<Cell
				label={ label }
				hideLabelFromVision={ hideLabelFromVision }
				id={ id }
				help={ help }
				className={ className }
				type={ type }
				value={ value }
				onChangeValue={ onChange }
				aria-describedby={ !! help ? id + '__help' : undefined }
				{ ...props }
			/>
		);
	}
);

export default TextControl;
