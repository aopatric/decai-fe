const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = () => {
    return {
        context: __dirname,
        entry: './src/index.tsx', // Entry point for your application
        output: {
            path: path.resolve(__dirname, 'public'), // Output directory
            filename: 'bundle.js', // Output filename
            library: {
                type: 'umd',
            },
            publicPath: '/', // Ensure all assets are served correctly
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
                    test: /\.tsx?$/,
                    use: 'ts-loader',
                    exclude: /node_modules/,
                },
                {
                    test: /\.css$/i,
                    use: ['style-loader', 'css-loader'],
                },
            ],
        },
        plugins: [
            new CopyPlugin({
                patterns: [
                    { from: 'node_modules/onnxruntime-web/dist/*.wasm', to: '[name][ext]' }, // Copy WebAssembly files
                ],
            }),
            new HtmlWebpackPlugin({
                template: './public/index.html', // Template for HTML
            }),
        ],
        // devServer: {
        //     hot: true, // Enable Hot Module Replacement
        //     static: {
        //         directory: path.join(__dirname, 'public'), // Directory to serve static files
        //         publicPath: '/', // Serve files from the root path
        //     },
        //     compress: true, // Enable gzip compression
        //     port: 9000, // Port number
        //     historyApiFallback: true, // SPA fallback to index.html
        //     proxy: {
        //         '/datasets': {
        //             target: 'http://localhost:9000', // Ensure this matches the backend or file server
        //             pathRewrite: { '^/datasets': '/datasets' }, // Ensure the path is correctly rewritten
        //             changeOrigin: true,
        //         },
        //     },
        // },
        resolve: {
            extensions: ['.tsx', '.ts', '.js'],
        },
    };
};
