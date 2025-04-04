cc.Node.prototype._onPreDestroy = new Proxy(cc.Node.prototype._onPreDestroy, {
    apply: function(target, thisArg, args) {
        if(thisArg && thisArg.__a){
            thisArg.__a.decRef();
            // const uuids = cc.assetManager.dependUtil.getDeps(thisArg.__a._uuid);
            // const assets = cc.assetManager.assets;
            // uuids.forEach((uuid)=>{
            //     const asset = assets.get(uuid);
            //     if(asset){
            //         asset.decRef();
            //     }
            // });
            delete thisArg.__a;
        }
        return target.apply(thisArg, args);
    }
});

function traverseNode(node, callback) {
    if(!node){
        return;
    }
    // 先处理当前节点
    callback(node);
    
    // 遍历所有子节点
    node.children.forEach(child => {
        traverseNode(child, callback);
    });
}

cc.instantiate = new Proxy(cc.instantiate, {
    apply: function(target, thisArg, args) {
        const node = target.apply(thisArg, args);
        if(args[0] instanceof cc.Prefab){
            node.__a = args[0].addRef(true);
        }else{
            traverseNode(node, (curNode)=>{
                const comp = curNode.getComponent(cc.Sprite) || curNode.getComponent(sp.Skeleton);
                if(cc.isValid(comp)){
                    comp.__clone = true;
                }
            });
        }
        return node;
    }
});

function hookResourceLoad(){
    const oldLoad = cc.resources.load;
    const wrapComplete = (cb)=>{
        return function(err, prefab){
            if(prefab){
                prefab._isProj = true;
            }
            return cb(err, prefab);
        }
    }
    
    cc.resources.load = function(paths, type, onProgress, onComplete){
        if(type === cc.Prefab){
            if(onProgress && !onComplete){
                onProgress = wrapComplete(onProgress)
            }
        }
    
        oldLoad.call(cc.resources, paths, type, onProgress, onComplete);
    }
}

const intl = setInterval(()=>{
    if(cc.resources){
        hookResourceLoad();
        clearInterval(intl);
    }
}, 500);


// 是否是引擎在新增
cc.Asset.prototype.addRef = function(isProj){
    this._isProj = !!isProj;
    if(this._r_t === undefined){
        this._r_t = 0;// 0b11.   
    }
    if(isProj){
        this._r_t |= 1
    }else{
        this._r_t |= 2;
    }
    if(this._r_t === 3){// 表示混合资源
        this._ref = 655350;// 设置一个巨大值，禁止引擎的释放。
    }
    this._ref++;
    return this;
}

const oldSprite = cc.Sprite.prototype;
infos = Object.getOwnPropertyDescriptor(oldSprite, "spriteFrame");
if(infos){
    infos.set = new Proxy(infos.set, {
        apply: function (target, thisArg, argArray) {
            if(thisArg._spriteFrame === argArray[0]){
                return;
            }

            if(argArray[0]){
                argArray[0].addRef(true);
                // argArray[0].__node = thisArg.node;
            }

            if(thisArg._spriteFrame){
                if(thisArg._spriteFrame._uuid){// 表示工程内
                    if(thisArg._spriteFrame._isProj){
                        thisArg._spriteFrame.decRef();
                        if(thisArg._spriteFrame._ref <= 0){
                            thisArg._spriteFrame = null;
                        }
                    }
                }else{// 表示动态创建
                    if(cc.isValid(thisArg._spriteFrame._texture)){   
                        thisArg._spriteFrame._texture.decRef();
                    }
                    thisArg._spriteFrame = null;// 直接让v8回收
                }
            }
            Reflect.apply(target, thisArg, argArray);
        }
    });

    Object.defineProperty(oldSprite, 'spriteFrame', infos);
}

oldSprite._onPreDestroy = new Proxy(oldSprite._onPreDestroy, {
    apply: function(target, thisArg, args) {
        if(thisArg.__clone){//克隆node的不进行任何处理
            return target.apply(thisArg, args);
        }
        if(cc.isValid(thisArg._spriteFrame)){
            if(thisArg._spriteFrame._uuid){// 表示工程内
                if(thisArg._spriteFrame._isProj){
                    thisArg._spriteFrame.decRef();
                    if(thisArg._spriteFrame._ref <= 0){
                        thisArg._spriteFrame = null;
                    }
                }
            }else{// 表示动态创建
                if(cc.isValid(thisArg._spriteFrame._texture)){   
                    thisArg._spriteFrame._texture.decRef();
                }
                thisArg._spriteFrame = null;// 直接让v8回收
            }
        }
        return target.apply(thisArg, args);
    }
});

// 动画
const oldspSpine = sp.Skeleton.prototype;
infos = Object.getOwnPropertyDescriptor(oldspSpine, "skeletonData");
if(infos){
    infos.set = new Proxy(infos.set, {
        apply: function (target, thisArg, argArray) {
            if(thisArg.skeletonData === argArray[0]){
                return;
            }else{
                if(argArray[0]){
                    argArray[0].addRef(true);
                }

                if(thisArg.skeletonData){
                    if(thisArg.skeletonData._dy){//表示远程 
                        thisArg.skeletonData.textures.forEach((asset)=>{
                            asset.decRef();
                        });
                    }else if(thisArg.skeletonData._isProj){
                        thisArg.skeletonData.decRef();
                    }
                }
                
                return Reflect.apply(target, thisArg, argArray);
            }
        }
    });

    Object.defineProperty(oldspSpine, 'skeletonData', infos);
}

oldspSpine._onPreDestroy = new Proxy(oldspSpine._onPreDestroy, {
    apply: function(target, thisArg, args) {
        if(thisArg.__clone){//克隆node的不进行任何处理
            return target.apply(thisArg, args);
        }
        const skeletonData = thisArg.skeletonData;
        if(skeletonData){
            if(skeletonData._dy){//表示远程 
                skeletonData.textures.forEach((asset)=>{
                    asset.decRef();
                });
            }else if(skeletonData._isProj){
                skeletonData.decRef();
            }
        }
        return target.apply(thisArg, args);
    }
});

const oldPlayMusic =  cc.audioEngine.playMusic;
const oldPlayEffect = cc.audioEngine.playEffect;
const clipMaps = {};
cc.audioEngine.playMusic = function (a, b){
    clipMaps[a._name] = a;
    return oldPlayMusic.call(cc.audioEngine, a, b);
}
cc.audioEngine.playEffect = function (a, b){
    clipMaps[a._name] = a;
    return oldPlayEffect.call(cc.audioEngine, a, b);
}
window.destroyClips = function(filter){
    for(let key in clipMaps){
        if(key.includes(filter)){
            let clip = clipMaps[key];
            delete clipMaps[key];
            cc.assetManager.releaseAsset(clip);
        }
    }
}

window.ignoreuuids = [];

// uuids 忽略的资源uuid
window.hookTryRelease = function(){
    if(!Array.isArray(ignoreuuids)){
        return;
    }
    const uuidsMap = {}; 
    ignoreuuids.forEach(uuid=>{
        if(!uuid){
            return;
        }
        uuidsMap[uuid] = 1;
        const asset = cc.assetManager.assets.get(uuid);
        if(asset){
            const deps = cc.assetManager.dependUtil.getDeps(uuid);
            deps.forEach(uuid2=>{
                uuidsMap[uuid2] = 1;
            });
        }
    });

    const oldTryRelease = cc.assetManager._releaseManager.tryRelease;
    cc.assetManager._releaseManager.tryRelease = function(asset, force){
        if(asset._uuid && !uuidsMap[asset._uuid]){
            oldTryRelease.call(cc.assetManager._releaseManager, asset, force);
        }
    }
}