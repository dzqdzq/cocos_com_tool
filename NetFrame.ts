const { ccclass, menu, property } = cc._decorator;

enum UrlType {
    UNKNOWN,
    REMOTE,
    LOCAL,
    REMOTE_HEADER,
}

type SucCallback = (spe : cc.SpriteFrame) => void;

function promisify (func) {
    return function (...args) {
        return new Promise((resolve, reject) => {
            func.call(this, ...args, (err, data) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(data);
                }
            });
        });
    };
}

// url 格式为：
// 1. 本地资源：assets/xxx.png
// 2. bunlde 资源：bundle://xxx.png
function resolveResourceUrl (url: string): { bundle: cc.AssetManager.Bundle, url: string } {
    let bundle = cc.resources;

    if (!url) {
        return { bundle, url };
    }

    const parts = url.split('://');
    if (parts.length > 1) {
        const b = cc.assetManager.getBundle(parts[0]);
        if (b) {
            url = parts[1];
            bundle = b;
        }
    }

    return { bundle, url };
}

// Object.values(cc.assetManager.assets._map).filter((a)=>!a.name.includes("builtin-"))
@ccclass
@menu('常用组件/NetFrame')
export default class AviaBC2BaseNetFrame extends cc.Sprite {
    // 网络图片地址
    @property()
        url  = '';

    // 显示的sprite大小
    @property(cc.size)
        size : cc.Size = new cc.Size(0, 0);

    start () {
        this.loadFrame(this.url);
    }

    /**
     * 重置成原图，方便重复使用
     */
    reset () {
    }

    wrapSucCallback (onSucc:SucCallback) {
        if (typeof onSucc !== 'function') {
            return;
        }
        return (err, sp) => {
            !err && onSucc(sp);
        };
    }

    async loadFrameAsync (url) {
        const type = this.getUrlType(url);
        let data;
        try {
            switch (type) {
                case UrlType.LOCAL:
                    data = await promisify(this.loadLocal.bind(this))(url);
                    break;
                case UrlType.REMOTE:
                    data = await promisify(this.loadRemote.bind(this))(url);
                    break;
                default:
                    break;
            }
        } catch (err) {
            cc.log('loadFrameAsync error:', err);
        }

        return data;
    }

    /**
     * 加载资源
     * @param url 加载图片资源，支持本地资源和网络资源
     * @param onSucc 第一个参数可能是回调，也有可能是默认地址
     */
    loadFrame (url:string, onSucc ?: SucCallback, needHeader?:boolean) {
        const type = this.getUrlType(url, needHeader);
        switch (type) {
            case UrlType.UNKNOWN:
                if (typeof onSucc === 'string') { // 存粹为了兼容老版本，第二个参数是字符串
                    url = onSucc;
                    onSucc = undefined;
                    switch (this.getUrlType(url)) {
                        case UrlType.LOCAL:
                            this.loadLocal(url, this.wrapSucCallback(onSucc));
                            break;
                        case UrlType.REMOTE:
                            this.loadRemote(url, this.wrapSucCallback(onSucc));
                            break;
                        case UrlType.REMOTE_HEADER:
                            this.loadRemote(url, this.wrapSucCallback(onSucc));
                            break;
                        default:
                            break;
                    }
                }
                break;
            case UrlType.LOCAL:
                this.loadLocal(url, this.wrapSucCallback(onSucc));
                break;
            case UrlType.REMOTE:
                this.loadRemote(url, this.wrapSucCallback(onSucc));
                break;
            case UrlType.REMOTE_HEADER:
                this.loadRemoteFromHeader(url, this.wrapSucCallback(onSucc));
                break;

            default:
                break;
        }
    }

    /**
     * 加载资源, 如果失败则使用默认资源
     * @param url 加载图片资源，支持本地资源和网络资源
     * @param onSucc 第一个参数可能是回调，也有可能是默认地址
     */
    public loadFrameIfFailUseDefault (url:string, defaultUrl:string): Promise<cc.SpriteFrame | undefined> {
        return new Promise<cc.SpriteFrame | undefined>((resolve) => {
            const type = this.getUrlType(url);
            switch (type) {
                case UrlType.UNKNOWN:
                    this.loadFrame(defaultUrl, (spriteFrame) => resolve(spriteFrame));
                    break;
                case UrlType.LOCAL:
                    this.loadLocal(url, (err, sp) => {
                        if (err) {
                            this.loadFrame(defaultUrl, (spriteFrame) => resolve(spriteFrame));
                        } else {
                            resolve(sp);
                        }
                    });
                    break;
                case UrlType.REMOTE:
                    this.loadRemote(url, (err, sp) => {
                        if (err) {
                            this.loadFrame(defaultUrl, (spriteFrame) => resolve(spriteFrame));
                        } else {
                            resolve(sp);
                        }
                    });
                    break;
                default:
                    resolve(undefined);
                    break;
            }
        });
    }

    /**
     *
     * @param url
     * @returns 获取URL类型
     */
    private getUrlType (url, needHeader = false) {
        if (typeof url !== 'string' || url == '') {
            return UrlType.UNKNOWN;
        }
        if (url.startsWith('https://') || url.startsWith('http://') || url.startsWith('/')) {
            return needHeader ? UrlType.REMOTE_HEADER : UrlType.REMOTE;
        }
        return UrlType.LOCAL;
    }

    /**
     * 加载本地资源
     * @param url
     * @param onSucc
     */
    private loadLocal (url: string, onSucc: (err, sp?:cc.SpriteFrame) =>void) {
        const resolved = resolveResourceUrl(url);
        url = resolved.url;

        resolved.bundle.load(url, cc.SpriteFrame, (err, sp:cc.SpriteFrame) => {
            if (!this || !cc.isValid(this)) {
                onSucc && onSucc('null');
                return;
            }

            if (err) {
                onSucc && onSucc(err);
                return;
            }
            if (!cc.isValid(sp, true)) {
                setTimeout(() => {
                    if (cc.isValid(this)) {
                        this.loadLocal(url, onSucc);
                    }
                }, 0);
                return;
            }
            this.spriteFrame = sp;
            this.resetSize();
            onSucc && onSucc(err, this.spriteFrame);
        });
    }

    // 使用图片流
    public loadRemoteFromStream (response: ArrayBuffer, onSucc:(err, sp?:cc.SpriteFrame) =>void) {
        if (response) {
            const img = new Image();
            img.src = URL.createObjectURL(new Blob([response]));
            img.onload = () => {
                const texture = new cc.Texture2D();
                texture.initWithElement(img);

                this.spriteFrame = new cc.SpriteFrame(texture);
                texture.packable = false;

                this.resetSize();
                onSucc && onSucc(null, this.spriteFrame);
            };
        }
    }

    /**
     * 加载远程资源
     * @param url
     * @param onSucc
     */
    private loadRemote (url: string, onSucc:(err, sp?:cc.SpriteFrame) =>void) {
        const self = this;
        let ext = cc.path.extname(url).toLowerCase();
        if (!ext.length) {
            ext = '.png';
        }
        const now = Date.now();
        const cached = cc.assetManager.cacheManager && !cc.assetManager.cacheManager.getCache(url);
        cc.assetManager.loadRemote(url, { ext }, (err, texture:cc.Texture2D) => {
            // 可能已经销毁
            if (!self || !cc.isValid(self)) {
                onSucc && onSucc('null');
                return;
            }

            if (err) {
                onSucc && onSucc(err);
                return;
            }
            // 可能已经销毁
            if (!cc.isValid(texture, true)) {
                setTimeout(() => {
                    if (cc.isValid(this)) {
                        this.loadRemote(url, onSucc);
                    }
                }, 0);
                return;
            }
            texture.addRef(true);

            self.spriteFrame = new cc.SpriteFrame(texture);
            texture.packable = false;
            self.resetSize();
            onSucc && onSucc(err, self.spriteFrame);
        });
    }

    resetSize () {
        if (cc.isValid(this.node)) {
            // 设置sprite的大小
            const sizeMode = this.getComponent(cc.Sprite).sizeMode;
            if (sizeMode == cc.Sprite.SizeMode.RAW) {
                // 按照设置的大小显示图片
                if (this.spriteFrame) {
                    this.node.width = this.spriteFrame.getOriginalSize().width;
                    this.node.height = this.spriteFrame.getOriginalSize().height;
                }
            } else if ((this.size.width == 0 && this.size.height == 0) || sizeMode == cc.Sprite.SizeMode.TRIMMED) {
                // 按照原图大小显示
                if (this.spriteFrame) {
                    this.node.width = this.spriteFrame.getRect().width;
                    this.node.height = this.spriteFrame.getRect().height;
                }
            } else {
                // 按照设置的大小显示图片
                this.node.width = this.size.width;
                this.node.height = this.size.height;
            }
        }
    }

    setSize (size : cc.Size) {
        this.size = size;
        this.resetSize();
    }
}
