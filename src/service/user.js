import jwt from 'jsonwebtoken';

export function userData(token) {
    if (!token) return null;
    try {
        const userData = jwt.decode(token, process.env.JWT_SECRET);
        return userData;
    } catch (err) {
        console.log(err);
        return null;
    }
}