/**
 * ルーティング
 *
 * @ignore
 */
import * as conf from 'config';
import { Request, Response, Router } from 'express';
import * as languageController from '../controllers/language';

// 本体サイトのトップページの言語別URL
const topUrlByLocale = conf.get<any>('official_url_top_by_locale');

// 本体サイトのチケット案内ページの言語別URL
const ticketInfoUrlByLocale = conf.get<any>('official_url_ticketinfo_by_locale');

// 本体サイトの入場案内ページの言語別URL
const aboutEnteringUrlByLocale = conf.get<any>('official_url_aboutentering_by_locale');

// 本体サイトのプライバシーポリシーページの言語別URL
const privacyPolicyUrlByLocale = conf.get<any>('official_url_privacypolicy_by_locale');

// 本体サイトのお問い合わせページの言語別URL
const contactUrlByLocale = conf.get<any>('official_url_contact_by_locale');

const router = Router();

// 言語
router.get('/language/update/:locale', languageController.update);

// 利用規約ページ
router.get('/terms/', (req: Request, res: Response) => {
    res.locals.req = req;
    res.locals.conf = conf;
    res.locals.validation = null;
    res.locals.title = 'Tokyo Tower';
    res.locals.description = 'TTTS Terms';
    res.locals.keywords = 'TTTS Terms';

    res.render('common/terms/');
});

// 本体サイトのチケット案内ページの対応言語版(無ければ英語版)に転送
router.get('/ticketinfo', (req: Request, res: Response) => {
    const locale: string = (typeof req.getLocale() === 'string' && req.getLocale() !== '') ? req.getLocale() : 'en';
    const url: string = (ticketInfoUrlByLocale[locale] || ticketInfoUrlByLocale.en);

    res.redirect(url);
});

// 本体サイトの入場案内ページの対応言語版(無ければ英語版)に転送
router.get('/aboutenter', (req: Request, res: Response) => {
    const locale: string = (typeof req.getLocale() === 'string' && req.getLocale() !== '') ? req.getLocale() : 'en';
    const url: string = (aboutEnteringUrlByLocale[locale] || aboutEnteringUrlByLocale.en);

    res.redirect(url);
});

// 本体サイトのプライバシーポリシーページの対応言語版(無ければ英語版)に転送
router.get('/privacypolicy', (req: Request, res: Response) => {
    const locale: string = (typeof req.getLocale() === 'string' && req.getLocale() !== '') ? req.getLocale() : 'en';
    const url: string = (privacyPolicyUrlByLocale[locale] || privacyPolicyUrlByLocale.en);

    res.redirect(url);
});

// 本体サイトのお問い合わせページの対応言語版(無ければ英語版)に転送
router.get('/contact', (req: Request, res: Response) => {
    const locale: string = (typeof req.getLocale() === 'string' && req.getLocale() !== '') ? req.getLocale() : 'en';
    const url: string = (contactUrlByLocale[locale] || contactUrlByLocale.en);

    res.redirect(url);
});

// 本体サイトトップページの対応言語版(無ければ英語版)に転送
router.get('/returntop', (req: Request, res: Response) => {
    const locale: string = (typeof req.getLocale() === 'string' && req.getLocale() !== '') ? req.getLocale() : 'en';
    const url: string = (topUrlByLocale[locale] || topUrlByLocale.en);

    res.redirect(url);
});

export default router;
