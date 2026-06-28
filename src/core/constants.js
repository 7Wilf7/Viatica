export const TRANSACTION_TYPES = [
  { id: "expense", label: "支出" },
  { id: "income", label: "收入" },
];

export const ACCOUNTS = [
  "微信",
  "银行卡",
  "支付宝",
  "其他",
];

export const BOOKS = [
  "日常账本",
  "训练账本",
  "旅行账本",
];

export const CURRENCIES = [
  "CNY",
  "USD",
  "HKD",
  "EUR",
  "JPY",
];

export const EXPENSE_CATEGORIES = [
  "餐饮",
  "交通",
  "购物",
  "运动装备",
  "比赛/训练",
  "健康",
  "AI 工具",
  "订阅",
  "学习",
  "娱乐",
  "旅行",
  "其他",
];

export const INCOME_CATEGORIES = [
  "薪酬",
  "红包",
  "转入",
  "退款",
  "其他收入",
];

export const CATEGORIES = EXPENSE_CATEGORIES;

export const DEFAULT_BUDGETS = {
  "餐饮": 2500,
  "交通": 600,
  "购物": 1200,
  "运动装备": 1000,
  "比赛/训练": 800,
  "健康": 600,
  "AI 工具": 500,
  "订阅": 300,
  "学习": 600,
  "娱乐": 500,
  "旅行": 1500,
  "其他": 500,
};
