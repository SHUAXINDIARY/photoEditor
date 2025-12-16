import { createRouter, createWebHistory } from "vue-router";
import PhotoEditor from "../page/PhotoEditor/index.vue";
import VideoEditor from "../page/VideoEditor/index.vue";

const routes = [
	{
		path: "/",
		redirect: "/photo-editor",
	},
	{
		path: "/photo-editor",
		name: "PhotoEditor",
		component: PhotoEditor,
	},
	{
		path: "/video-editor",
		name: "VideoEditor",
		component: VideoEditor,
	},
];

const router = createRouter({
	history: createWebHistory(),
	routes,
});

export default router;

