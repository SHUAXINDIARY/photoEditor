import { defineConfig } from "@rspack/cli";
import {
  type RspackPluginFunction,
  rspack,
  type SwcLoaderOptions,
} from "@rspack/core";
import { VueLoaderPlugin } from "vue-loader";

// Target browsers, see: https://github.com/browserslist/browserslist
const targets = ["last 2 versions", "> 0.2%", "not dead", "Firefox ESR"];

export default defineConfig({
  entry: {
    main: "./src/main.ts",
  },
  output: {
    publicPath: "/",
	enabledWasmLoadingTypes: ['fetch'],
  },
  resolve: {
    extensions: ["...", ".ts", ".vue"],
  },
  module: {
    rules: [
      {
        test: /\.worker\.js$/,
        use: { loader: "worker-rspack-loader" },
      },
      {
        test: /\.vue$/,
        loader: "vue-loader",
        options: {
          experimentalInlineMatchResource: true,
        },
      },
      {
        test: /\.(js|ts)$/,
        exclude: [
          /node_modules\/@ffmpeg/,
        ],
        use: [
          {
            loader: "builtin:swc-loader",
            options: {
              jsc: {
                parser: {
                  syntax: "typescript",
                },
              },
              env: { targets },
            } satisfies SwcLoaderOptions,
          },
        ],
      },
      {
        test: /\.svg/,
        type: "asset/resource",
      },
      {
        test: /\.wasm$/,
        type: "asset/resource",
      },
    ],
  },
  plugins: [
    // new rspack.library.EnableWasmLoadingPlugin("fetch"),
    new rspack.HtmlRspackPlugin({
      template: "./index.html",
    }),
    new rspack.DefinePlugin({
      __VUE_OPTIONS_API__: true,
      __VUE_PROD_DEVTOOLS__: false,
    }),
    new VueLoaderPlugin() as RspackPluginFunction,
  ],
  optimization: {
    minimizer: [
      new rspack.SwcJsMinimizerRspackPlugin(),
      new rspack.LightningCssMinimizerRspackPlugin({
        minimizerOptions: { targets },
      }),
    ],
  },
  experiments: {
    css: true,
  },
  devServer: {
    historyApiFallback: true,
    static: {
      directory: "./public",
      publicPath: "/",
    },
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
    proxy: [
      {
        context: [
          "/ffmpeg-core.js",
          "/ffmpeg-core.wasm",
          "/ffmpeg-core.worker.js",
        ],
        target: "https://cdn.jsdelivr.net/npm/@ffmpeg/core-mt@0.12.10/dist/esm",
        changeOrigin: true,
        secure: true,
        pathRewrite: {
          "^/ffmpeg-core": "",
        },
        onProxyRes: (proxyRes) => {
          proxyRes.headers["Cross-Origin-Embedder-Policy"] = "require-corp";
        },
      },
    ],
  },
  ignoreWarnings: [
    {
      module: /node_modules\/@ffmpeg\/ffmpeg\/dist\/esm\/worker\.js/,
      message:
        /Critical dependency: the request of a dependency is an expression/,
    },
  ],
});
