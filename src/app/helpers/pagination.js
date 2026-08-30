/**
 * Phân trang tuỳ chọn qua query string: ?page=1&limit=50
 *
 * Không truyền gì thì trả về toàn bộ bản ghi, giữ nguyên hợp đồng cũ với frontend.
 * Truyền vào thì Prisma nhận skip/take. Frontend sẽ chuyển sang dùng dần.
 */
export const parsePagination = (query, { maxLimit = 200 } = {}) => {
    const rawPage = Number.parseInt(query?.page, 10);
    const rawLimit = Number.parseInt(query?.limit, 10);

    if (!Number.isInteger(rawLimit) || rawLimit <= 0) {
        return { enabled: false };
    }

    const limit = Math.min(rawLimit, maxLimit);
    const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;

    return { enabled: true, page, limit, skip: (page - 1) * limit, take: limit };
};

/** Gắn thêm khối meta khi phân trang được bật. */
export const paginationMeta = (pagination, total) =>
    pagination.enabled
        ? {
              pagination: {
                  page: pagination.page,
                  limit: pagination.limit,
                  total,
                  total_pages: Math.ceil(total / pagination.limit)
              }
          }
        : {};
