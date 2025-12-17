declare module "*.vue" {
	import type { DefineComponent } from "vue";
	const component: DefineComponent<{}, {}, any>;
	export default component;
}

declare module "@ffmpeg/core" {
	const url: string;
	export default url;
}

declare module "@ffmpeg/core/wasm" {
	const url: string;
	export default url;
}

declare module "@ffmpeg/ffmpeg/worker" {
	const url: string;
	export default url;
}