export class PortfolioQuery {
  /**
   * ポートフォリオ一覧
   */
  public static getList(): string {
    return `
      *[
        _type == "portfolio"
      ]
      | order(publishedAtCustom desc) {
        _id,
        _type,

        slug {
          current
        },

        title,
        publishedAtCustom,

        thumbnailMedia {
          _type,
          type,

          image,
          alt,

          vimeoUrl,
          videoUrl
        },

        modalDescription,
        themeColor,
        accentTextColor
      }
    `;
  }

  /**
   * slugから作品詳細を取得
   */
  public static getBySlug(): string {
    return `
      *[
        _type == "portfolio" &&
        slug.current == $slug
      ][0] {
        _id,
        _type,

        slug {
          current
        },

        title,
        publishedAtCustom,

        thumbnailMedia {
          _type,
          type,

          image,
          alt,

          vimeoUrl,
          videoUrl
        },

        previewMedia[] {
          _key,
          _type,

          type,

          image,
          alt,

          vimeoUrl,
          videoUrl
        },

        relatedLinks[] {
          _key,
          label,
          url
        },

        modalDescription,
        themeColor,
        accentTextColor,

        story {
          items[] {
            _key,

            title,
            body,

            image,
            caption
          }
        },

        concept {
          body,

          image,
          caption
        },

        gallery {
          images[] {
            _key,

            image,
            alt
          }
        },

        credits {
          people[] {
            _key,

            name,
            role,

            links[] {
              _key,
              label,
              url
            }
          }
        },

        metaTitle,
        metaDescription,
        ogpImage
      }
    `;
  }
}