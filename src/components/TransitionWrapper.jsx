import React from 'react';


const pageVariants = {
    initial: {
        opacity: 0,
        y: 10,
        scale: 0.99,
        filter: 'blur(10px)',
    },
    animate: {
        opacity: 1,
        y: 0,
        scale: 1,
        filter: 'blur(0px)',
        transition: {
            duration: 0.4,
            ease: [0.22, 1, 0.36, 1], // Custom cubic-bezier for premium feel
        },
    },
    exit: {
        opacity: 0,
        y: -10,
        scale: 1.01,
        filter: 'blur(10px)',
        transition: {
            duration: 0.3,
            ease: [0.22, 1, 0.36, 1],
        },
    },
};

const TransitionWrapper = ({ children }) => {
    return (
        <motion.div
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="w-full min-h-screen"
        >
            {children}
        </motion.div>
    );
};

export default TransitionWrapper;
