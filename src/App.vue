<script setup lang="ts">
import { useRoute } from "vue-router";

const route = useRoute();
</script>

<template>
	<div class="app-wrapper">
		<nav class="navigation">
			<div class="nav-container">
				<div class="nav-brand">图片编辑器</div>
				<div class="nav-links">
					<router-link 
						to="/photo-editor" 
						class="nav-link"
						:class="{ active: route.name === 'PhotoEditor' }"
					>
						图片编辑
					</router-link>
					<router-link 
						to="/video-editor" 
						class="nav-link"
						:class="{ active: route.name === 'VideoEditor' }"
					>
						视频编辑
					</router-link>
				</div>
			</div>
		</nav>
		<main class="main-content">
			<router-view />
		</main>
	</div>
</template>

<style scoped>
.app-wrapper {
	width: 100vw;
	height: 100vh;
	display: flex;
	flex-direction: column;
	overflow: hidden;
}

.navigation {
	background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
	box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
	z-index: 1000;
	flex-shrink: 0;
}

.nav-container {
	max-width: 100%;
	margin: 0 auto;
	padding: 0 20px;
	display: flex;
	align-items: center;
	justify-content: space-between;
	height: 60px;
}

.nav-brand {
	font-size: 20px;
	font-weight: bold;
	color: white;
}

.nav-links {
	display: flex;
	gap: 8px;
	align-items: center;
}

.nav-link {
	padding: 8px 16px;
	color: rgba(255, 255, 255, 0.9);
	text-decoration: none;
	border-radius: 6px;
	font-size: 14px;
	font-weight: 500;
	transition: all 0.3s ease;
	background: rgba(255, 255, 255, 0.1);
}

.nav-link:hover {
	background: rgba(255, 255, 255, 0.2);
	color: white;
	transform: translateY(-1px);
}

.nav-link.active {
	background: rgba(255, 255, 255, 0.25);
	color: white;
	font-weight: 600;
	box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.main-content {
	flex: 1;
	overflow: hidden;
	min-height: 0;
}
</style>
