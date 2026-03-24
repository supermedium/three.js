import { Scene } from '../../scenes/Scene.js';
import { DepthTexture } from '../../textures/DepthTexture.js';
import { RGBAFormat, HalfFloatType, NearestFilter, NoColorSpace, DepthStencilFormat, DepthFormat, UnsignedInt248Type, UnsignedIntType } from '../../constants.js';
import { WebGLMultiviewRenderTarget } from '../WebGLMultiviewRenderTarget.js';

/**
 * A XR module that renders motion vectors for SpaceWarp in a second lower-resolution pass.
 */
class WebXRSpaceWarp {

	constructor( renderer, gl ) {

		this.renderer = renderer;
		this.gl = gl;
		this.multiviewExt = gl.getExtension( 'OVR_multiview2' );

		this.frameBuffer = null;
		this.motionVectorRenderTarget = null;

		this.scene = new Scene();

	}

	isSupported() {

		return this.multiviewExt !== null;

	}

	hasValidSubImage( glSubImage ) {

		return !!(
			glSubImage &&
			glSubImage.motionVectorTexture &&
			glSubImage.depthStencilTexture &&
			Number.isFinite( glSubImage.motionVectorTextureWidth ) &&
			Number.isFinite( glSubImage.motionVectorTextureHeight )
		);

	}

	needsReinit( glSubImage ) {

		if ( ! this.motionVectorRenderTarget ) return true;

		return (
			this.motionVectorRenderTarget.width !== glSubImage.motionVectorTextureWidth ||
			this.motionVectorRenderTarget.height !== glSubImage.motionVectorTextureHeight
		);

	}

	render( glSubImage, cameraXR ) {

		if ( ! this.isSupported() ) return false;
		if ( ! this.hasValidSubImage( glSubImage ) ) return false;
		if ( ! cameraXR || ! cameraXR.cameras || cameraXR.cameras.length < 2 ) return false;

		if ( this.needsReinit( glSubImage ) ) this.initRenderTarget( glSubImage );
		if ( ! this.motionVectorRenderTarget || ! this.frameBuffer ) return false;

		const { renderer, gl, multiviewExt } = this;
		const prevRenderTarget = renderer.getRenderTarget();
		const depthAttachment = gl.getContextAttributes().stencil ? gl.DEPTH_STENCIL_ATTACHMENT : gl.DEPTH_ATTACHMENT;

		const leftCam = cameraXR.cameras[ 0 ];
		const rightCam = cameraXR.cameras[ 1 ];
		if ( ! leftCam || ! rightCam || ! leftCam.viewport || ! rightCam.viewport ) return false;

		const w = this.motionVectorRenderTarget.width;
		const h = this.motionVectorRenderTarget.height;

		// Save viewports (No GC)
		const lvp = leftCam.viewport, rvp = rightCam.viewport;
		const lx = lvp.x, ly = lvp.y, lw = lvp.z, lh = lvp.w;
		const rx = rvp.x, ry = rvp.y, rw = rvp.z, rh = rvp.w;

		try {

			gl.bindFramebuffer( gl.DRAW_FRAMEBUFFER, this.frameBuffer );

			multiviewExt.framebufferTextureMultiviewOVR( gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, glSubImage.motionVectorTexture, 0, 0, 2 );
			multiviewExt.framebufferTextureMultiviewOVR( gl.DRAW_FRAMEBUFFER, depthAttachment, glSubImage.depthStencilTexture, 0, 0, 2 );

			renderer.setRenderTarget( this.motionVectorRenderTarget );
			renderer.clear();

			// Force full size for this target
			lvp.set( 0, 0, w, h );
			rvp.set( 0, 0, w, h );

			renderer.render( this.scene, cameraXR );

			return true;

		} finally {

			// Restore viewports
			lvp.set( lx, ly, lw, lh );
			rvp.set( rx, ry, rw, rh );

			renderer.setRenderTarget( prevRenderTarget );

		}

	}

	initRenderTarget( glSubImage ) {

		if ( ! this.hasValidSubImage( glSubImage ) ) return;

		const { renderer, gl } = this;
		const width = glSubImage.motionVectorTextureWidth;
		const height = glSubImage.motionVectorTextureHeight;

		if ( this.motionVectorRenderTarget &&
			this.motionVectorRenderTarget.width === width &&
			this.motionVectorRenderTarget.height === height ) {

			return;

		}

		if ( this.motionVectorRenderTarget ) {

			this.motionVectorRenderTarget.dispose();
			this.motionVectorRenderTarget = null;

		}

		const attributes = gl.getContextAttributes();
		const depthFormat = attributes.stencil ? DepthStencilFormat : DepthFormat;
		const depthType = attributes.stencil ? UnsignedInt248Type : UnsignedIntType;

		const motionVectorOptions = {
			format: RGBAFormat,
			type: HalfFloatType,
			minFilter: NearestFilter,
			magFilter: NearestFilter,
			colorSpace: NoColorSpace,
			stencilBuffer: attributes.stencil,
			depthTexture: new DepthTexture( width, height, depthType, undefined, undefined, undefined, undefined, undefined, undefined, depthFormat ),
			samples: 0
		};

		this.motionVectorRenderTarget = new WebGLMultiviewRenderTarget( width, height, 2, motionVectorOptions );
		this.motionVectorRenderTarget.ignoreDepthValues = false;

		if ( ! this.frameBuffer ) this.frameBuffer = renderer.getContext().createFramebuffer();
		renderer.setRenderTargetFramebuffer( this.motionVectorRenderTarget, this.frameBuffer );

	}

	dispose() {

		if ( this.motionVectorRenderTarget ) {

			this.motionVectorRenderTarget.dispose();
			this.motionVectorRenderTarget = null;

		}

		if ( this.frameBuffer ) {

			this.gl.deleteFramebuffer( this.frameBuffer );
			this.frameBuffer = null;

		}

	}

}

export { WebXRSpaceWarp };
