# VanManga - 漫画抓取应用

<div align="center">
  
![newIcon](https://github.com/user-attachments/assets/9f8b9d7e-e573-4adb-9503-2783ebd507a4)

![Brands](https://github.com/Alen-QK/python-vanmanga-crawler/assets/37805183/654e0b06-45e4-4754-8841-51abb64d019e)

![Preview](https://github.com/Alen-QK/python-vanmanga-crawler/assets/37805183/40b1bfc5-0e74-41e3-9fe0-07ba6882ca12)

VanManga 是一款轻量化的，功能丰富的漫画抓取应用。该应用可以抓取、管理漫画资源，以此为漫画阅读、资源备份等提供服务。

[Readme - English Version](https://github.com/Alen-QK/python-vanmanga-crawler/blob/aijiangsb/dev_config/README-engVer.md)

</div>  
  
  
## VanManga有什么功能？
1. 🔍 **漫画搜索** - 通过在搜索框中输入漫画名称，你可以获取前十个最相关的搜索结果，并选择你喜欢的漫画进行下载。
2. ⚠️ **漫画管理** - 支持在搜索阶段对漫画库查重，避免重复资源，同时支持手动管理漫画自动更新和删除。
3. 📋 **下载队列** - 漫画会根据下载任务提交顺序进入队列等待，并依序下载。
4. 🔄 **每日自动更新** - 应用会每日定时扫描所有已下载漫画，检查并自动下载最新的更新内容。
5. 🖥️ **下载管理面板** - 在管理面板中，你可以检视所有的已下载资源。并且可以通过WebSocket返回的信息实时跟踪当前下载任务的进度和漫画下载状态。
6. 🗃️ **重新打包漫画文件** - 有外部资源？抑或是本地资源文件结构有问题？没关系，可以使用本地重新打包功能对资源文件夹下的所有漫画文件进行重新打包。
7. 🔧 **重新下载指定内容** - 想要对下载可能失败的单章漫画进行修复？没问题，使用单章重新下载的功能你可以自由的选择任意漫画的任何章节进行重下。
8. ↗️ **整合Kavita外链跳转** - 支持与Kavita的账户绑定，设置后可以在管理界面点击跳转至Kavita对应漫画界面。
9. 📱 **适配手机浏览器** - 支持手机浏览器布局，提升移动设备浏览体验。
10. **也许在未来我们会添加更多新功能！**

## 如何安装？

目前，本应用可以通过 Docker Hub 上的打包镜像来进行本地部署。同时，你也可以自定义本地 VanManga 的 HTTP 服务端口。

1. 请确保你的系统中已经安装了[Docker](https://www.docker.com/)。在 Windows 和 MacOS 系统下，我们推荐安装[Docker Desktop](https://www.docker.com/products/docker-desktop/)的 GUI 界面来更轻松的进行部署。如果你正在使用 Linux 系统，请使用命令行来完成部署。
2. 安装 Docker 后，请使用如下命令来从 Docker Hub 获取最新版本的 VanManga 镜像：
   ```
   docker pull wzl778633/vanislord_manga:latest
   ```
3. 为了确保你的 Docker 容器可以正常运行，请按照如下介绍设置 环境变量 \ 文件路径映射 \ 端口:
   - 环境变量
     >  **PYTHONUNBUFFERED**: 用于使 Docker container 可以输出应用的日志记录，默认值是 1  
       **MANGA_BASE_URL**: 你用于连接后端的 URL，默认值是 http://localhost:5000. 如果你正在你的 Docker 中使用 bridge，你需要把'localhost'改成你的 bridge 的内部 IP。  
       **MANGA_BASE_WEBSOCKET_URL**: 你对外暴露的服务器 URL, 主要用于 WebSocket 服务, 默认值是 http://localhost:5000.  
       **KAVITA_BASE_URL - 可选**: 你Kavita服务器的主机内部地址，用于允许服务器从内网连接。如果正在使用DSM，请输入桥接路径。示例：http://192.168.0.1:5000  
       **KAVITA_EXPOSE_URL - 可选**： 你Kavita服务器外部暴露地址，用于允许前端页面向Kavita服务跳转。示例：https://kavita:5000   
       **KAVITA_ADMIN_APIKEY - 可选**： 你的Kavita管理员ApiKey（必须是管理员权限），可从Kavita管理员“设置面板-API密钥/OPDS”一项找到。  
       **KAVITA_LIB_ID - 可选**： 你准备连接的Kavita库序号，默认值是1，仅在需要额外指定时推荐设置。  
       **FLARESOLVERR_URL - 可选**： 你的[FlareSolverr](https://github.com/FlareSolverr/FlareSolverr)内部地址，允许服务器连接FlareSolverr对漫画源的人机检查进行规避，如果正在使用DSM，请输入桥接路径。额外推荐版本为[21hsmw-flaresolverr](https://github.com/21hsmw/FlareSolverr)  
       **NUMBER_OF_WORKERS - 可选**： 服务器同时并发下载章节的最大数量，默认值是2。默认值即推荐值，最大请不要超过4 or 5，非常容易被侦测并block。    
     **请注意，如果需要Kavita相关的服务能够正常配置，则KAVITA_BASE_URL，KAVITA_EXPOSE_URL，KAVITA_ADMIN_APIKEY为必选，缺失会导致相关功能默认关闭**
   - 文件路径映射
     > { 你的主机上想要设置为漫画下载库的物理地址 } <==> /downloaded  
       { 你的主机上想要设置为漫画 config 文件夹的物理地址 } <==> /vanmanga/eng_config  
       { 你的主机上想要设置为漫画封面文件夹的物理地址} <==> /vanmanga/thumbnails
   - 端口
     > 5000:5000 /_ 你也可以映射任何你想映射的端口 _/
     > 你可以直接复制并使用如下命令，或者在 Docker Desktop 的 GUI 中直接设置相关参数:
   ```
   docker run --name /*你的容器名称*/ \
   -e PYTHONUNBUFFERED=1 \
   -e MANGA_BASE_URL=http://localhost:5000  \
   -e MANGA_BASE_WEBSOCKET_URL=http://localhost:5000  \
   -e KAVITA_BASE_URL=/*Kavita内部地址*/ \
   -e KAVITA_EXPOSE_URL=/*Kavita外部地址*/ \
   -e KAVITA_ADMIN_APIKEY=/*Kavita管理员ApiKey*/ \
   -e KAVITA_LIB_ID=/*Kavita库标号*/ \
   -e FLARESOLVERR_URL=/*FlareSolverr服务器地址*/ \
   -e NUMBER_OF_WORKERS=2 \
   --mount type=bind,source=/*你的主机上想要设置为漫画下载库的物理地址*/,target=/downloaded \
   --mount type=bind,source=/*你的主机上想要设置为漫画config文件夹的物理地址*/,target=/vanmanga/eng_config \
   --mount type=bind,source=/*你的主机上想要设置为漫画封面文件夹的物理地址*/,target=/vanmanga/thumbnails \
   -p 5000:5000
   wzl778633/vanislord_manga:latest
   ```
4. 当容器开始运行后，服务器会自动进行初始化。你可以在 Docker container 的日志记录中查看服务器初始化的状态。
   - 初始化的目的在于:
   1. 扫描 config 文件夹下的`manga_library.json`，将所有的已经存在的漫画记录都添加到服务器中，同时检查每部漫画是否有更新。
   2. 检查Kavita配置，在允许的情况下连接Kavita服务器获取meta data。
   3. 检查FlareSolverr配置，在允许的情况下连接Bypasser服务器，用于绕过CloudFlare检查。
5. Kavita服务跳转设置  
   **请注意，由于跳转功能依赖同源策略，所以请保证本服务于Kavita服务器运行在同一域名\桥接\本地服务中**。由于Kavita默认禁止同源策略，所以请依照以下步骤进行设置：
   1. 打开Kavita容器```/kavita/config```的物理映射路径
   2. 找到```appsettings.json```，建议先进行备份再修改
   3. 在```appsettings.json```中添加```"AllowIFraming": true```，并保存
   4. 重启Kavita服务，现在Kavita将支持同源策略，接受本服务的iframe自动登录功能
## 如何使用？

1. **搜索漫画**  
   目前我们使用[DogeManga](https://dogemanga.com/)来作为漫画源。  
   在搜索框中输入想搜索的漫画名称，它会返回前十个最相关的结果。**请注意：** 我们会在用户提交下载任务时自动检查已存在资源中是否有可能的类似漫画，如果存在，我们会返回相关信息方便用户确认。  
   ![s1](https://github.com/Alen-QK/python-vanmanga-crawler/assets/37805183/b0daddd5-faa3-41e6-aaba-2b18c8ea43a7)  
   ![s2](https://github.com/Alen-QK/python-vanmanga-crawler/assets/37805183/1b7ab286-64c6-4069-83dc-bae342fdc49a)
2. **下载漫画**  
   从搜索结果中选择希望下载的对象，并提交下载任务。目前，应用会下载目标漫画下可下载的所有内容(包括但不限于：单行本、连载章节、番外、特殊内容等)。
   ![s3](https://github.com/Alen-QK/python-vanmanga-crawler/assets/37805183/b27b1631-0faa-46a2-96f9-645b3929907e)  
   ![s4](https://github.com/Alen-QK/python-vanmanga-crawler/assets/37805183/2b0d9c7a-e343-4ad6-8a0a-57493a87460e)
3. **漫画库管理界面**  
   你下载的所有漫画都可以在此仪表板中找到。你可以查看每部漫画的当前状态（例如：下载中/排队中/已完成...）。目前，仪表板仅显示了你已下载的每部漫画的最新章节名称，以便你跟踪每部漫画的状态。
   ![s4](https://github.com/user-attachments/assets/a12e8c6b-6853-4044-9886-383d5ceb9ed5)
5. **重新下载**  
   对于每一部漫画，如果在阅读过程中发现任何（包括但不限于：单行本、连载章节、番外）内容出现错误，您可以简单地请求重新下载该特定（包括但不限于：单行本、连载章节、番外）的内容。
   ![s5](https://github.com/user-attachments/assets/03c2eaaa-aba9-4f16-ac45-2570eaf2a31b)
   ![s7](https://github.com/Alen-QK/python-vanmanga-crawler/assets/37805183/0b2aca2f-1a40-4d66-9671-0992f1b9ac61)
   ![s8](https://github.com/Alen-QK/python-vanmanga-crawler/assets/37805183/d19194c8-e273-4dbe-9439-53e54b0a4a3d)
7. **管理更新/删除**  
   可以手动对每一部漫画的自动抓取状态进行设置，对应在系统内的状态也会实时显示在左侧。点击删除按钮，会将对应漫画从漫画库和资源物理地址中一并删除。
   ![s9](https://github.com/user-attachments/assets/855d8f37-08b8-4608-81ff-59499c1e6724)
   ![s10](https://github.com/user-attachments/assets/059c3bbb-2c64-4740-a306-e0024feb803c)
8. **登录Kavita账户**  
   选择侧边栏的Kavita连接配置，输入Kavita的用户名和密码，即可登录。登录后在漫画库管理界面中，点击漫画的封面，即可跳转到Kavita对应漫画页面。
   ![s11](https://github.com/user-attachments/assets/6e1c248b-c450-4401-ad7c-5fdc25cbab67)
9. **阅读漫画**  
   目前，本应用的文件结构主要支持[Kavita](https://github.com/Kareadita/Kavita)。我们也强烈建议你使用 Kavita 来作为漫画库服务器。您可以通过其 Web 界面轻松管理您的漫画文件，并使用其阅读器进行阅读。它同样支持在 IOS 设备上使用[Paperback](https://paperback.moe/)以及在 Android 设备上使用[Mihon](https://mihon.app/)进行阅读。下面是一些有关服务器部署及设置的相关链接：

   - Kavita: https://wiki.kavitareader.com/
   - Paperback: https://wiki.kavitareader.com/guides/3rdparty/paperback
   - Mihon: https://wiki.kavitareader.com/guides/3rdparty/tachi-like

   当然，如果你喜欢使用除 Kavita 外的其他的漫画服务器，请随意使用～

## 贡献

### 贡献者

目前，有两位主要贡献者在为这个项目开发。
<a href="https://github.com/Alen-QK/python-vanmanga-crawler/graphs/contributors">
Tom "Van" Wang & Kun "Alen" Qi
</a>

我们非常欢迎你对我们的项目做出任何贡献～

## License

[MIT](LICENSE)
