const path = require('path');
const CopyPlugin = require("copy-webpack-plugin");
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = (env) => {
  const port = env && env.port ? parseInt(env.port) : 9000;
	return {
		// target: ['web'],
        context: __dirname,
		entry: './src/main.js',
		output: {
			path: path.resolve(__dirname, 'dist'),
			filename: 'bundle.js',
		},
         module: {
            rules: [
                {
                    test: /\.js$/,
                    exclude: /node_modules/,
                    use: {
                        loader: 'babel-loader',
                    },
                }, 
                {
                    test: /\.css$/i,
                    use: ['style-loader', 'css-loader'],
                }]},
		plugins: [
            new CopyPlugin({
			    patterns: [{ from: 'node_modules/onnxruntime-web/dist/*.wasm', to: '[name][ext]'}]
		    }), 
            new HtmlWebpackPlugin({
                template: './src/index.html',
        })],
        devServer: {
            static: {
                directory: path.join(__dirname, 'dist'),
            },
            compress: true,
            hot: true,
            host: "localhost",
            port: port
        },
		resolve: {
			extensions: ['.js'],
            fallback: {
                crypto: require.resolve('crypto-browserify'),
                stream: require.resolve("stream-browserify"),
                buffer: require.resolve("buffer/"),
            }
		}
	}
};