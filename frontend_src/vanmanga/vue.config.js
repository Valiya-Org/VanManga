const { defineConfig } = require('@vue/cli-service')
const Version = new Date().getTime();
const isPro = process.env.NODE_ENV === 'production';
module.exports = defineConfig({
  transpileDependencies: true,
  devServer:{
    host: '192.168.1.7',
    port:9070,
    proxy: {
      '/api': {
        target: 'http://192.168.1.7:5000',
        ws: true,
        withCredentials:true,
        changeOrigin: true,
        // pathRewrite: {
        //   '^/api': ''
        // }
      }
    }
  },

  chainWebpack: config => {
    if (isPro) {
      config.plugin('extract-css').tap((args) => [
        {
          filename: `css/[name].${Version}.css`,
          chunkFilename: `css/[name].${Version}.css`,
        },
      ])
    }
    //config.output.globalObject('this')
    //config.optimization.delete('splitChunks')
  },

  parallel: false,
  publicPath: '/',
  outputDir: './static',
  indexPath: './templates/index.html',

  configureWebpack: {
    output: {
      filename: `js/[name].${Version}.js`,
      chunkFilename: `js/[name].${Version}.js`,
    },
    devtool: 'source-map',
    performance:{
      maxAssetSize: 30000000,
    }
  },

  css: {
    loaderOptions: {
      less: {
        // 若 less-loader 版本小于 6.0，请移除 lessOptions 这一级，直接配置选项。
        lessOptions: {
          modifyVars: {
            'tabbar-item-active-color': '#a85dc3',
            'tag-primary-color': '#a85dc3',
          },
        },
      },
    },
  },


})
