import { createRouter, createWebHistory } from "vue-router";
import PhotoEditor from "../page/PhotoEditor/index.vue";

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
];

const router = createRouter({
	history: createWebHistory(),
	routes,
});

export default router;

