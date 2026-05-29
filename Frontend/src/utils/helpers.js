export const formatDate = (date) => {
    return new Date(date).toLocaleDateString();
};

export const truncateString = (str, num) => {
    if (str.length <= num) return str;
    return str.slice(0, num) + '...';
};
