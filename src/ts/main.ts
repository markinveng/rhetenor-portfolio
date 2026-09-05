import { WorkList } from "./World/Water/WorkList";
import { WorkDetail } from "./World/Water/WorkDetail";
import { getOrCreateCursor, disposeCursor } from "./Cursor";

/*
 * サイト全体のJavaScriptエントリポイント。
 * ページ内のdata属性を起点に各機能を初期化する。
 */
class App {
  private workLists: WorkList[] = [];
  private workDetails: WorkDetail[] = [];

  public init(): void {
    getOrCreateCursor();
    this.initWorkList();
    this.initWorkDetail();
  }

  public destroy(): void {
    this.workLists.forEach((workList) => workList.destroy());
    this.workDetails.forEach((workDetail) => workDetail.destroy());

    this.workLists = [];
    this.workDetails = [];

    disposeCursor();
  }

  private initWorkList(): void {
    const elements = document.querySelectorAll<HTMLElement>(
      "[data-portfolio-canvas]",
    );

    elements.forEach((element) => {
      const workList = new WorkList(element);

      workList.init();

      this.workLists.push(workList);
    });
  }

  private initWorkDetail(): void {
    const elements = document.querySelectorAll<HTMLElement>(
      "[data-work-detail]",
    );

    elements.forEach((element) => {
      const workDetail = new WorkDetail(element);

      workDetail.init();

      this.workDetails.push(workDetail);
    });
  }
}

/*
 * astro:transitions(ClientRouter)によるページ遷移のたびに
 * 前のページのインスタンスを破棄してから作り直す。
 * 破棄はastro:before-swapで行う(WaterBackground/DiscoverGalleryと同じ規約)。
 * WorkList/WorkDetailが保持するThree.jsのmaterial/geometryは、それらを描画していた
 * 共有WorldのRenderer(WaterBackground等がastro:before-swapで破棄する)より先に
 * 破棄しておく必要があるため、このリスナーはLayout.astro側で他の
 * コンポーネントより先に登録されるようにしている(Layout.astro参照)。
 */
let app: App | null = null;

const start = (): void => {
  app = new App();
  app.init();
};

const stop = (): void => {
  app?.destroy();
  app = null;
};

document.addEventListener("astro:page-load", start);
document.addEventListener("astro:before-swap", stop);
window.addEventListener("beforeunload", stop, { once: true });
