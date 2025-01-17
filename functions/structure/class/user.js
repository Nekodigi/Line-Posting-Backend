const firestore = require("../../infrastructure/firestore/firestore");
const projectURL = require("../../infrastructure/firebase/firebase").projectURL;
const field = require("../../structure/const/field");
const gmail = require("../../infrastructure/gmail/gmail");
const Post = require("./post");
const { check_post } = require("../../structure/const/field");
const status = require("../../structure/const/status");
const { deleteAll } = require("../../infrastructure/firebaseStorage/firebaseStorage");
const date = require('date-and-time');//npm install date-and-time https://www.geeksforgeeks.org/node-js-date-format-api/
const { randomChar } = require("../../util/random");
const { getHash } = require("../../infrastructure/crypto/hash");
const { postsList, text } = require("../../infrastructure/line/templete");
const { client } = require("../../infrastructure/line/line");

class User{
    constructor(){
    }

    //(await) replace Constructor
    static async build(id){
        var user = new User();
        var userData = await firestore.getDocument("users", id);
        if(userData == undefined){
            var defaultData = {[field.id]:id, [field.status]:status.follow, [field.sub_status]:"", 
            [field.created_date]:new Date(), [field.post_id]:"", [field.name]:"", [field.is_admin]:false, 
            [field.email]:"", [field.check_post]:"", [field.var0]:"", [field.group_id]:""};
            await firestore.setDocument("users", id, defaultData);//use variable for dictionary initialization
            Object.assign(user, defaultData);
        }else{
            Object.assign(user, userData);
            if(!(user[field.post_id] === "" || user[field.post_id] === undefined)){
                user[field.post] = await Post.build(user[field.post_id], user[field.id]);
            }
        }
        user[field.id] = id;
        return user;
    }

    reset(){
        if(this[field.post] !== undefined){this[field.post].delete();this.setField(field.post_id, "")}
    }

    async newPost(){
        if(this[field.post] !== undefined){this[field.post].delete();this.setField(field.post_id, "")}

        this[field.post] = await Post.build(date.format(new Date(), "YYMMDD")+randomChar(2), this[field.id]);
        this.setField(field.post_id, this[field.post].id);
    }

    getStatus(){
        return [this[field.status], this[field.sub_status]];
    }

    setStatus(status_, sub_status){
        this[field.status] = status_;//for instant reference
        this[field.sub_status] = sub_status;//for instant reference
        firestore.updateField("users", this[field.id], field.status, status_);
        firestore.updateField("users", this[field.id], field.sub_status, sub_status);
    }
    
    setSubstatus(sub_status){
        this[field.sub_status] = sub_status;//for instant reference
        firestore.updateField("users", this[field.id], field.sub_status, sub_status);
    }

    setField(field_, value){
        this[field_] = value;
        firestore.updateField("users", this[field.id], field_, value);
    }

    async sendMail(){
        console.log("SEND MAIL 開始");
        var admins = await firestore.getDocumentsWhere("users", field.is_admin, "==", true);
        var posts = await firestore.getDocumentsWhere("posts", "status", "==", status.waiting_approval);

        if(posts.length === 0)return;
        var body = "";
        body += posts.length+"件の記事が未確認です。記事を確認するリンクを開いて、承認・却下のどちらかのリンクを開いてください。\n";

        posts.forEach((post, i) => {
            body+=`＝＝＝＝＝${i+1}件目＝＝＝＝＝\nタイトル：${post[field.title]}\n`;
            body+=`記事を確認する。\n${projectURL()}/preview?id=${post[field.id]}\n`;
            body+=`記事を承認する。\n${projectURL()}/approve?id=${post[field.id]}&hash=${getHash("approve"+post[field.id])}\n`;
            body+=`記事を却下する。\n${projectURL()}/deny?id=${post[field.id]}&hash=${getHash("deny"+post[field.id])}\n`;
        });

        var lineMessage = [postsList(posts.slice(0, 10), (post) => [
            {"type": "uri","label": "確認","uri": `${projectURL()}/preview?id=${post[field.id]}`},
            {"type": "uri","label": "承認","uri": `${projectURL()}/approve?id=${post[field.id]}&hash=${getHash("approve"+post[field.id])}`},
            {"type": "uri","label": "拒否","uri": `${projectURL()}/deny?id=${post[field.id]}&hash=${getHash("deny"+post[field.id])}`},
        ])];
        lineMessage.push(text(`${posts.length}件の記事が未確認です。ご確認ください。`));

        console.log("SEND MAIL 中盤");

        admins.forEach(admin => {
            console.log(admin[field.check_post]);
            if(admin[field.check_post] === "email"){
                gmail.send(admin[field.email], "新しい記事が投稿されました。ご確認ください。", body);
            }else if(admin[field.check_post] === "line"){
                console.log(admin.id, lineMessage);
                client.pushMessage(admin.id, lineMessage);
            }
        })
    }

    doPost(){//tepmporary move to preview
        //firestore.incrementField("variable", "postPerMonth", this[field.id].substring(0, 4), 1);
        this.setStatus(status.idle, "");
        this.setField(field.post_id, "");
        this[field.post].setStatus(status.waiting_approval, "");
        this.sendMail();
    }
}

module.exports = User;