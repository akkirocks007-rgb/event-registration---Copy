import React from 'react';


const pageVariants = {
    initial: {
        opacity: 0,
        y: 15,
        scale: 0.98,
        filter: 'blur(8px)',
    },
    animate: {
        opacity: 1,
        y: 0,
        scale: 1,
        filter: 'blur(0px)',
        transition: {
            duration: 0.6,
            ease: [0.22, 1, 0.36, 1],
            staggerChildren: 0.1
        },
    },
    exit: {
        opacity: 0,
        y: -15,
        scale: 1.02,
        filter: 'blur(8px)',
        transition: {
            duration: 0.4,
            ease: [0.22, 1, 0.36, 1],
        },
    },
};

const PageWrapper = ({ children }) => {
    return (
        <motion.div
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="w-full min-h-screen origin-center"
        >
            {children}
        </motion.div>
    );
};

export default PageWrapper;
