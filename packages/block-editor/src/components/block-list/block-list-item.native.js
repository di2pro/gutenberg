/**
 * External dependencies
 */
import { View, Dimensions } from 'react-native';

/**
 * WordPress dependencies
 */
import { Component } from '@wordpress/element';
import { withSelect } from '@wordpress/data';
import { compose } from '@wordpress/compose';
import { ReadableContentView, alignmentHelpers } from '@wordpress/components';

/**
 * Internal dependencies
 */
import BlockListBlock from './block';
import BlockInsertionPoint from './insertion-point';
import styles from './block-list-item.native.scss';

const stretchStyle = {
	flex: 1,
};

export class BlockListItem extends Component {
	constructor() {
		super( ...arguments );

		this.onLayout = this.onLayout.bind( this );

		this.state = {
			blockWidth: this.props.blockWidth,
		};
	}

	onLayout( { nativeEvent } ) {
		const { layout } = nativeEvent;
		const { blockWidth } = this.props;
		const layoutWidth = Math.floor( layout.width );

		if ( blockWidth !== layoutWidth ) {
			this.setState( { blockWidth: layout.width } );
		}
	}

	getMarginHorizontal() {
		const {
			blockAlignment,
			marginHorizontal,
			parentBlockAlignment,
			hasParents,
			blockName,
			parentBlockName,
			parentWidth,
		} = this.props;
		const { blockWidth } = this.state;
		const {
			isFullWidth,
			isWideWidth,
			isWider,
			isContainerRelated,
		} = alignmentHelpers;

		if ( isFullWidth( blockAlignment ) ) {
			if ( ! hasParents ) {
				return 0;
			}
			return marginHorizontal;
		}
		if ( isWideWidth( blockAlignment ) ) {
			return marginHorizontal;
		}

		const screenWidth = Math.floor( Dimensions.get( 'window' ).width );

		if (
			isFullWidth( parentBlockAlignment ) &&
			! isWider( blockWidth, 'medium' )
		) {
			if (
				isContainerRelated( blockName ) ||
				isWider( screenWidth, 'mobile' )
			) {
				return marginHorizontal;
			}
			return marginHorizontal * 2;
		}

		if (
			isContainerRelated( parentBlockName ) &&
			! isContainerRelated( blockName )
		) {
			const isScreenWidthEqual = parentWidth === screenWidth;
			if ( isScreenWidthEqual || isWider( screenWidth, 'mobile' ) ) {
				return marginHorizontal * 2;
			}
		}

		return marginHorizontal;
	}

	getContentStyles( readableContentViewStyle ) {
		const {
			blockAlignment,
			blockName,
			hasParents,
			parentBlockName,
		} = this.props;
		const { isFullWidth, isContainerRelated } = alignmentHelpers;

		return [
			readableContentViewStyle,
			isFullWidth( blockAlignment ) &&
				! hasParents && {
					width: styles.fullAlignment.width,
				},
			! blockAlignment &&
				hasParents &&
				! isContainerRelated( parentBlockName ) &&
				isContainerRelated( blockName ) && {
					paddingHorizontal: styles.fullAlignmentPadding.paddingLeft,
				},
		];
	}

	render() {
		const {
			blockAlignment,
			clientId,
			isReadOnly,
			shouldShowInsertionPointBefore,
			shouldShowInsertionPointAfter,
			contentResizeMode,
			shouldShowInnerBlockAppender,
			parentWidth,
			marginHorizontal,
			blockName,
			...restProps
		} = this.props;
		const readableContentViewStyle =
			contentResizeMode === 'stretch' && stretchStyle;
		const { isContainerRelated } = alignmentHelpers;

		return (
			<ReadableContentView
				align={ blockAlignment }
				style={ [
					readableContentViewStyle,
					isContainerRelated( blockName ) &&
						parentWidth && {
							maxWidth: parentWidth + 2 * marginHorizontal,
						},
				] }
			>
				<View
					style={ this.getContentStyles( readableContentViewStyle ) }
					pointerEvents={ isReadOnly ? 'box-only' : 'auto' }
					onLayout={ this.onLayout }
				>
					{ shouldShowInsertionPointBefore && (
						<BlockInsertionPoint />
					) }
					<BlockListBlock
						key={ clientId }
						showTitle={ false }
						clientId={ clientId }
						parentWidth={ parentWidth }
						{ ...restProps }
						marginHorizontal={ this.getMarginHorizontal() }
					/>
					{ ! shouldShowInnerBlockAppender() &&
						shouldShowInsertionPointAfter && (
							<BlockInsertionPoint />
						) }
				</View>
			</ReadableContentView>
		);
	}
}

export default compose( [
	withSelect(
		( select, { rootClientId, isStackedHorizontally, clientId } ) => {
			const {
				getBlockOrder,
				getBlockInsertionPoint,
				isBlockInsertionPointVisible,
				getSettings,
				getBlockParents,
				__unstableGetBlockWithoutInnerBlocks,
			} = select( 'core/block-editor' );

			const blockClientIds = getBlockOrder( rootClientId );
			const insertionPoint = getBlockInsertionPoint();
			const blockInsertionPointIsVisible = isBlockInsertionPointVisible();
			const shouldShowInsertionPointBefore =
				! isStackedHorizontally &&
				blockInsertionPointIsVisible &&
				insertionPoint.rootClientId === rootClientId &&
				// if list is empty, show the insertion point (via the default appender)
				( blockClientIds.length === 0 ||
					// or if the insertion point is right before the denoted block
					blockClientIds[ insertionPoint.index ] === clientId );

			const shouldShowInsertionPointAfter =
				! isStackedHorizontally &&
				blockInsertionPointIsVisible &&
				insertionPoint.rootClientId === rootClientId &&
				// if the insertion point is at the end of the list
				blockClientIds.length === insertionPoint.index &&
				// and the denoted block is the last one on the list, show the indicator at the end of the block
				blockClientIds[ insertionPoint.index - 1 ] === clientId;

			const isReadOnly = getSettings().readOnly;

			const block = __unstableGetBlockWithoutInnerBlocks( clientId );
			const { attributes, name } = block || {};
			const { align } = attributes || {};
			const parents = getBlockParents( clientId, true );
			const hasParents = !! parents.length;
			const parentBlock = hasParents
				? __unstableGetBlockWithoutInnerBlocks( parents[ 0 ] )
				: {};
			const { align: parentBlockAlignment } =
				parentBlock?.attributes || {};
			const { name: parentBlockName } = parentBlock || {};

			return {
				shouldShowInsertionPointBefore,
				shouldShowInsertionPointAfter,
				isReadOnly,
				hasParents,
				blockAlignment: align,
				parentBlockAlignment,
				blockName: name,
				parentBlockName,
			};
		}
	),
] )( BlockListItem );
